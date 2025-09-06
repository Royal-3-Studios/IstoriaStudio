// src/lib/brush/engine.ts
/**
 * Procreate-style 6B pencil via cached offscreen stamps (strict TS).
 * - Dark center + gentle flanks (linear spine + small radial plate)
 * - Dual hairline bright rims (SCREEN), with tip-aware boost
 * - Sheen ring near the rim (SCREEN)
 * - Grain (core-only), slight longitudinal stretch
 * - Long, shallow tapers; tight ~1 px feather biased outward
 * - Enforces ≥352×128 preview when centerlinePencil is enabled
 */

export type BrushEngineConfig = {
  shape?: { sizeScale?: number };
  strokePath?: { scatter?: number };
};

export type RenderOptions = {
  engine: BrushEngineConfig;
  baseSizePx: number; // diameter in px
  color?: string; // hex
  width: number;
  height: number;
  seed?: number;
  path?: Array<{ x: number; y: number; angle?: number }>;
  colorJitter?: { h?: number; s?: number; l?: number; perStamp?: boolean };
  overrides?: Partial<{
    centerlinePencil: boolean;
    spacing: number; // fraction of radius (e.g. 0.36)
    jitter: number; // px
    scatter: number; // deg (unused here)
    flow: number; // 0..100
    softness: number; // 0..100 (lower = tighter)
    wetEdges: boolean;
    grainKind: "none" | "paper" | "canvas" | "noise";
    grainScale: number; // 0.25..4 (larger => finer in our mapping)
    grainDepth: number; // 0..100
    angle: number; // radians
    count: number; // unused
    grainRotate: number; // degrees
    /** overall rim brightness, 100 = default, 150 = +50% */
    edgeHotness: number; // 0..300
  }>;
};

const DEFAULT_COLOR = "#000000";
const PREVIEW_MIN = { width: 352, height: 128 };

/** Tuned toward the Procreate 6B sample */
const PENCIL_TUNING = {
  bodyWidthScale: 0.34,
  taperMin: 80,
  taperMax: 160,
  taperRadiusFactor: 12,

  // hairline rim (baseline; per-stamp thickness scales with radius)
  rimPx: 0.46,
  rimAlpha: 1,
  rimRGB: "255,255,255",

  // crisp AA band
  edgeBandPx: 0.17,

  // darker middle, almost no flank lift
  coreDarken: 0.94,
  flankLighten: 0.0,
  centerDarkenAlpha: 1,

  // grain (avoid mottled near-black)
  grainDepthDefault: 0.18,
  grainScaleDefault: 1.6,
  grainAnisoX: 0.65,
  grainAnisoY: 1.4,

  squashY: 0.82,
} as const;

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type StampSource = ImageBitmap | OffscreenCanvas | HTMLCanvasElement;
type StampKey = string;

/** Cache + schema bump to force rebuilds when shading logic changes */
const STAMP_CACHE = new Map<StampKey, StampSource>();
const STAMP_SCHEMA = 37; // bumped

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  interface Window {
    __STAMP_SCHEMA?: number;
  }
}
if (typeof window !== "undefined") {
  if (window.__STAMP_SCHEMA !== STAMP_SCHEMA) {
    STAMP_CACHE.clear();
    window.__STAMP_SCHEMA = STAMP_SCHEMA;
  }
}

// ----------------------------- helpers ------------------------------------

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// keep for reference
const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
// steeper for shorter/cleaner tips
const easePow = (t: number) => 1 - Math.pow(1 - clamp01(t), 2.2);

function hexToRgb(hex: string) {
  const s = hex.replace("#", "");
  const n = parseInt(
    s.length === 3
      ? s
          .split("")
          .map((c) => c + c)
          .join("")
      : s,
    16
  );
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// --- auto rim "edge hotness" support ---
function luminanceOfHex(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  // Rec. 709 luma (good enough for UI)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function rgbToCss({ r, g, b }: { r: number; g: number; b: number }, a = 1) {
  return `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${a})`;
}
function lightenRGB(rgb: { r: number; g: number; b: number }, amt: number) {
  return {
    r: rgb.r + (255 - rgb.r) * amt,
    g: rgb.g + (255 - rgb.g) * amt,
    b: rgb.b + (255 - rgb.b) * amt,
  };
}
function darkenRGB(rgb: { r: number; g: number; b: number }, amt: number) {
  return { r: rgb.r * (1 - amt), g: rgb.g * (1 - amt), b: rgb.b * (1 - amt) };
}
function seededRand(seed: number) {
  let x = seed || 123456789;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  };
}

/** Canvas creation with strict typing (no `any`). */
function makeCanvas(
  width: number,
  height: number
): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined")
    return new OffscreenCanvas(width, height);
  if (
    typeof document !== "undefined" &&
    typeof document.createElement === "function"
  ) {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    return c;
  }
  throw new Error("No canvas implementation available.");
}

/** 2D context guard */
function is2DContext(ctx: unknown): ctx is Ctx2D {
  if (!ctx || typeof ctx !== "object") return false;
  const c = ctx as Record<string, unknown>;
  return (
    typeof c.beginPath === "function" &&
    typeof c.drawImage === "function" &&
    typeof c.createLinearGradient === "function" &&
    typeof c.fillRect === "function" &&
    "canvas" in c
  );
}
function get2DContext(c: OffscreenCanvas | HTMLCanvasElement): Ctx2D {
  const ctx = c.getContext("2d");
  if (!is2DContext(ctx)) throw new Error("2D context not available.");
  return ctx;
}

/** Small noise tile for grain (returns canvas, not ImageBitmap). */
function makeNoiseTile(
  size = 64,
  seed = 1
): OffscreenCanvas | HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const ctx = get2DContext(c);
  const img = ctx.createImageData(size, size);
  const rnd = seededRand(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (rnd() * 0.6 + rnd() * 0.4) * 255;
    img.data[i + 0] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Prefer ImageBitmap for faster drawImage when available. */
async function toBitmapOrCanvas(
  c: OffscreenCanvas | HTMLCanvasElement
): Promise<StampSource> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(c);
    } catch {}
  }
  return c;
}

// ----------------------------- stamp composer -----------------------------

async function makePencilStampBitmap(
  radius: number,
  colorHex: string,
  opts: {
    rimPx: number;
    rimAlpha: number;
    grainDepth: number;
    grainScale: number;
    grainAnisoX: number;
    grainAnisoY: number;
    seed: number;
    edgeBandPx: number;
    coreDarken: number;
    flankLighten: number;
    centerDarkenAlpha: number;
    squashY: number;
    grainRotateRad: number;
  }
): Promise<StampSource> {
  const d = Math.max(2, Math.ceil(radius * 2 + 2));
  const c = makeCanvas(d, d);
  const ctx = get2DContext(c);

  ctx.clearRect(0, 0, d, d);
  ctx.save();
  ctx.translate(d / 2, d / 2);

  // --- derived tints (graphite highlight shouldn't be pure white)
  const baseRGB = hexToRgb(colorHex);
  const Lcol = luminanceOfHex(colorHex); // 0..1
  const lightenAmt = 0.7 + 0.2 * (1 - Lcol); // 0.70–0.90
  const rimRGB = lightenRGB(baseRGB, lightenAmt);
  const rimCss = rgbToCss(rimRGB, 1);

  // Base color shaping (dark core + gentle flanks)
  const rgbBase = darkenRGB(baseRGB, opts.coreDarken);
  const core = rgbToCss(rgbBase, 1);
  const coreLite = rgbToCss(lightenRGB(rgbBase, opts.flankLighten), 1);

  // 1) Core (lateral gradient) — clip to circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.clip();

  const tipKPlateau = clamp01((radius - 1.0) / 2.4); // 0 at tiny → 1 by ~3.4px
  const plateauA = 1.0 * tipKPlateau; // was hard 1.0

  const g = ctx.createLinearGradient(-radius, 0, radius, 0);
  g.addColorStop(0.0, coreLite);
  g.addColorStop(0.35, core);
  const plateauHalfPx = 0.1;
  const plateauHalf = Math.min(0.04, plateauHalfPx / (radius * 2));
  g.addColorStop(0.5 - plateauHalf, `rgba(0,0,0,${plateauA})`); // was 1
  g.addColorStop(0.5 + plateauHalf, `rgba(0,0,0,${plateauA})`); // was 1
  g.addColorStop(0.65, core);
  g.addColorStop(1.0, coreLite);
  ctx.fillStyle = g;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);

  // 1b) Center darken so rims pop (tip-aware)
  if (opts.centerDarkenAlpha > 0) {
    ctx.globalCompositeOperation = "multiply";
    const rgCenter = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.9);

    // tipK: 0 at tiny radii, 1 by ~3.4 px
    const tipK = clamp01((radius - 1.0) / 2.4);

    // was: 0.72 + 0.28*tipK  (always dark at the tip)
    // now: 0 → 0.72 across small→normal, scaled by user alpha
    const centerA = opts.centerDarkenAlpha * (0.72 * tipK);

    rgCenter.addColorStop(0, `rgba(0,0,0,${centerA})`);
    rgCenter.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rgCenter;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.globalCompositeOperation = "source-over";
  }

  // 1d) Center spine (slightly softer to avoid “crease” look)
  ctx.globalCompositeOperation = "multiply";
  {
    const spine = ctx.createLinearGradient(-radius, 0, radius, 0);
    const spineHalfPx = 0.12;
    const spineHalf = Math.max(
      0.002,
      Math.min(0.05, spineHalfPx / (radius * 2))
    );
    spine.addColorStop(0.0, "rgba(0,0,0,0)");
    spine.addColorStop(0.5 - spineHalf, "rgba(0,0,0,0)");
    spine.addColorStop(0.5, "rgba(0,0,0,0.88)"); // was 0.92
    spine.addColorStop(0.5 + spineHalf, "rgba(0,0,0,0)");
    spine.addColorStop(1.0, "rgba(0,0,0,0)");
    ctx.fillStyle = spine;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  }
  ctx.globalCompositeOperation = "source-over";

  // 1f) Core floor
  ctx.globalCompositeOperation = "multiply";
  {
    const floor = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.9);
    floor.addColorStop(0.0, "rgba(0,0,0,0.03)");
    floor.addColorStop(0.85, "rgba(0,0,0,0.01)");
    floor.addColorStop(1.0, "rgba(0,0,0,0)");
    ctx.fillStyle = floor;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  }
  ctx.globalCompositeOperation = "source-over";

  // 1e) Small plate to ensure near-black core
  ctx.globalCompositeOperation = "multiply";
  {
    const tipK = clamp01((radius - 1.0) / 2.4);
    const plate = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.7);
    plate.addColorStop(0, `rgba(0,0,0,${0.72 * tipK})`); // was fixed 0.72
    plate.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = plate;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  }
  ctx.globalCompositeOperation = "source-over";

  // 1c) Inner trough — (a little gentler at big radii)
  ctx.globalCompositeOperation = "multiply";
  {
    const startR = Math.max(0, radius - 1.05);
    const endR = Math.max(0, radius - 0.12);
    const k = clamp01((radius - 1.1) / 4.2);
    const depth = 0.5 + 0.35 * k; // was 0.8 + 0.22*k
    const rgTrough = ctx.createRadialGradient(0, 0, startR, 0, 0, endR);
    rgTrough.addColorStop(0, "rgba(0,0,0,0)");
    rgTrough.addColorStop(1, `rgba(0,0,0,${depth})`);
    ctx.fillStyle = rgTrough;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  }
  ctx.globalCompositeOperation = "source-over";

  // Tip-aware boost for first-pass rims
  const tipBoost = 1 + 0.9 * clamp01((3.2 - radius) / 3.2);

  // 2) Rims — first pass (SCREEN)
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = rimCss; // tinted, not pure white
  const rim = Math.max(0.28, Math.min(opts.rimPx, radius * 0.4));

  // top rim (brighter)
  ctx.globalAlpha = Math.min(1, opts.rimAlpha * 0.7 * tipBoost);
  ctx.fillRect(-radius + rim * 0.25, -radius, rim * 0.9, radius * 2);

  // bottom rim
  ctx.globalAlpha = Math.min(1, opts.rimAlpha * 0.46 * tipBoost);
  ctx.fillRect(+radius - rim * 1.25, -radius, rim * 0.9, radius * 2);

  // 2a) Micro-rim — narrower & tinted
  ctx.globalAlpha = Math.min(1, opts.rimAlpha * 0.52 * tipBoost);
  ctx.fillRect(-radius + rim * 0.35, -radius, rim * 0.48, radius * 2);
  ctx.globalAlpha = Math.min(1, opts.rimAlpha * 0.35 * tipBoost);
  ctx.fillRect(+radius - rim * 1.35, -radius, rim * 0.48, radius * 2);
  ctx.globalAlpha = 1;

  // 2b) Sheen ring — tinted + slightly dimmer
  {
    const r0 = Math.max(0, radius - 0.85);
    const r1 = radius + 0.08;
    const sheen0 = rgbToCss(rimRGB, 0.05); // was 0.055 white
    const sheen1 = rgbToCss(rimRGB, 0.012); // was 0.014 white
    const sheen = ctx.createRadialGradient(0, 0, r0, 0, 0, r1);
    sheen.addColorStop(0.0, sheen0);
    sheen.addColorStop(0.6, sheen1);
    sheen.addColorStop(1.0, "rgba(0,0,0,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  }
  ctx.globalCompositeOperation = "source-over";

  // 3) Grain (core only)
  if (opts.grainDepth > 0.001) {
    ctx.globalCompositeOperation = "multiply";
    const tile = makeNoiseTile(64, 31 * opts.seed + 7);
    const scale = Math.max(0.001, opts.grainScale);
    const w = Math.max(8, Math.floor((radius * 2) / scale));
    ctx.save();
    ctx.rotate(opts.grainRotateRad);
    ctx.scale(opts.grainAnisoX, opts.grainAnisoY);

    ctx.drawImage(tile, 0, 0, tile.width, tile.height, -radius, -radius, w, w);
    ctx.restore();

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = opts.grainDepth * 0.1;
    ctx.fillStyle = "black";
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.globalAlpha = 1;
  }

  // 3b) Re-enforce center seam (softer)
  ctx.globalCompositeOperation = "multiply";
  {
    const spine2 = ctx.createLinearGradient(-radius, 0, radius, 0);
    const spineHalfPx = 0.08;
    const spineHalf = Math.max(
      0.002,
      Math.min(0.05, spineHalfPx / (radius * 2))
    );
    const seamK = clamp01((radius - 1.0) / 2.0); // 0 at tiny tips → 1 normal
    const seamA = 0.18 + 0.7 * seamK;
    spine2.addColorStop(0.0, "rgba(0,0,0,0)");
    spine2.addColorStop(0.5 - spineHalf, "rgba(0,0,0,0)");
    spine2.addColorStop(0.5, `rgba(0,0,0,${seamA})`); // was 0.955
    spine2.addColorStop(0.5 + spineHalf, "rgba(0,0,0,0)");
    spine2.addColorStop(1.0, "rgba(0,0,0,0)");
    ctx.fillStyle = spine2;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  }
  ctx.globalCompositeOperation = "source-over";

  // 4) Tight feather (AA bias outward)
  const band = opts.edgeBandPx;
  const innerR2 = Math.max(0, radius - band * 0.0);
  const outerR2 = radius + band * 0.66;
  ctx.globalCompositeOperation = "destination-in";
  const rg = ctx.createRadialGradient(0, 0, innerR2, 0, 0, outerR2);
  rg.addColorStop(0, "rgba(0,0,0,1)");
  rg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rg;
  ctx.fillRect(-radius - 2, -radius - 2, radius * 2 + 4, radius * 2 + 4);
  ctx.globalCompositeOperation = "source-over";

  // 5) Longitudinal squash — radius-aware (rounder at tiny tips)
  const squashLocal = lerp(1.0, opts.squashY, clamp01((radius - 1.2) / 2.8));
  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  ctx.ellipse(0, 0, radius, radius * squashLocal, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  // 6) Post-feather rim reheat (donut clip)
  {
    ctx.save();
    const ringPx = 0.4 + 0.32 * clamp01((radius - 1.0) / 3.2);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius, radius * squashLocal, 0, 0, Math.PI * 2);
    ctx.ellipse(
      0,
      0,
      Math.max(0, radius - ringPx),
      radius * squashLocal,
      0,
      0,
      Math.PI * 2,
      true
    );
    ctx.clip("evenodd");

    const tipBoost2 = 1 + 1.5 * clamp01((3.0 - radius) / 3.0);
    const rim2 = Math.max(0.26, Math.min(opts.rimPx, radius * 0.4));

    // primary highlight (SCREEN) — slightly farther from silhouette
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = rimCss;

    ctx.globalAlpha = Math.min(1, opts.rimAlpha * 1.18 * tipBoost2);
    ctx.fillRect(-radius + rim2 * 0.2, -radius, rim2 * 0.9, radius * 2);

    ctx.globalAlpha = Math.min(1, opts.rimAlpha * 0.94 * tipBoost2);
    ctx.fillRect(+radius - rim2 * 1.2, -radius, rim2 * 0.9, radius * 2);

    // micro-sparkle — attenuate at tiny tips & narrower
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "color-dodge" as GlobalCompositeOperation;
    if (ctx.globalCompositeOperation !== "color-dodge")
      ctx.globalCompositeOperation = "lighter";

    const sparkleTipAtten = clamp01((radius - 1.1) / 2.2);
    ctx.globalAlpha = Math.min(1, opts.rimAlpha * 0.24 * sparkleTipAtten);
    ctx.fillRect(-radius + rim2 * 0.46, -radius, rim2 * 0.24, radius * 2);
    ctx.globalAlpha = Math.min(1, opts.rimAlpha * 0.18 * sparkleTipAtten);
    ctx.fillRect(+radius - rim2 * 1.46, -radius, rim2 * 0.24, radius * 2);

    ctx.globalCompositeOperation = prev;
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }

  ctx.restore();
  return toBitmapOrCanvas(c);
}

function stampKey(
  radius: number,
  color: string,
  rimPx: number,
  rimAlpha: number,
  grainScale: number,
  grainDepth: number,
  edgeBandPx: number,
  squashY: number,
  grainRotateDeg: number,
  coreDarken: number,
  flankLighten: number,
  centerDarkenAlpha: number
) {
  return [
    STAMP_SCHEMA,
    Math.round(radius * 10),
    color,
    Math.round(rimPx * 100),
    Math.round(rimAlpha * 100),
    Math.round(grainScale * 100),
    Math.round(grainDepth * 100),
    Math.round(edgeBandPx * 100),
    Math.round(squashY * 100),
    Math.round(grainRotateDeg),
    Math.round(coreDarken * 100),
    Math.round(flankLighten * 100),
    Math.round(centerDarkenAlpha * 100),
  ].join("|");
}

async function getPencilStamp(
  radius: number,
  color: string,
  opts: {
    rimPx: number;
    rimAlpha: number;
    grainScale: number;
    grainDepth: number;
    grainAnisoX: number;
    grainAnisoY: number;
    edgeBandPx: number;
    coreDarken: number;
    flankLighten: number;
    centerDarkenAlpha: number;
    squashY: number;
    seed: number;
    grainRotateRad: number;
    grainRotateDeg: number;
  }
): Promise<StampSource> {
  const key = stampKey(
    radius,
    color,
    opts.rimPx,
    opts.rimAlpha,
    opts.grainScale,
    opts.grainDepth,
    opts.edgeBandPx,
    opts.squashY,
    opts.grainRotateDeg,
    opts.coreDarken,
    opts.flankLighten,
    opts.centerDarkenAlpha
  );
  const cached = STAMP_CACHE.get(key);
  if (cached) return cached;

  const bmp = await makePencilStampBitmap(radius, color, {
    rimPx: opts.rimPx,
    rimAlpha: opts.rimAlpha,
    grainScale: opts.grainScale,
    grainDepth: opts.grainDepth,
    grainAnisoX: PENCIL_TUNING.grainAnisoX,
    grainAnisoY: PENCIL_TUNING.grainAnisoY,
    seed: opts.seed,
    edgeBandPx: opts.edgeBandPx,
    coreDarken: opts.coreDarken,
    flankLighten: opts.flankLighten,
    centerDarkenAlpha: opts.centerDarkenAlpha,
    squashY: PENCIL_TUNING.squashY,
    grainRotateRad: opts.grainRotateRad,
  });
  STAMP_CACHE.set(key, bmp);
  return bmp;
}

// ----------------------------- path utilities -----------------------------

function defaultPath(w: number, h: number) {
  const pts: Array<{ x: number; y: number; angle: number }> = [];
  const x0 = Math.max(6, Math.floor(w * 0.06));
  const x1 = Math.min(w - 6, Math.floor(w * 0.94));
  const midY = Math.floor(h * 0.6);
  const amp = Math.max(6, Math.min(h * 0.35, 32));
  const steps = 44;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = midY - amp * t + amp * 0.45 * Math.sin(6.5 * t);
    const dx = (x1 - x0) / steps;
    const dy = -amp / steps + (amp * 0.45 * 6.5 * Math.cos(6.5 * t)) / steps;
    pts.push({ x, y, angle: Math.atan2(dy, dx) });
  }
  return pts;
}

type Sample = { x: number; y: number; angle: number; s: number };

function resample(
  path: Array<{ x: number; y: number; angle?: number }>,
  spacing: number
): Sample[] {
  if (!path.length) return [];
  const segs: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    segs[i] = segs[i - 1] + Math.hypot(dx, dy);
  }
  const L = segs[segs.length - 1];
  if (L <= 0) return [];
  const out: Sample[] = [];
  for (let d = spacing * 0.5; d < L - spacing * 0.25; d += spacing) {
    let i = 1;
    while (i < segs.length && segs[i] < d) i++;
    const s0 = segs[i - 1],
      s1 = segs[i];
    const t = Math.min(1, Math.max(0, (d - s0) / Math.max(1e-6, s1 - s0)));
    const p0 = path[i - 1],
      p1 = path[i];
    const x = lerp(p0.x, p1.x, t),
      y = lerp(p0.y, p1.y, t);
    const ang =
      p0.angle != null && p1.angle != null
        ? lerp(p0.angle, p1.angle, t)
        : Math.atan2(p1.y - p0.y, p1.x - p0.x);
    out.push({ x, y, angle: ang, s: d });
  }
  return out;
}

// ------------------------------- main draw --------------------------------

export async function drawStrokeToCanvas(
  canvas: HTMLCanvasElement,
  opt: RenderOptions
): Promise<void> {
  // Enforce a larger preview if we're rendering the 6B pencil
  const minW = opt.overrides?.centerlinePencil ? PREVIEW_MIN.width : 1;
  const minH = opt.overrides?.centerlinePencil ? PREVIEW_MIN.height : 1;
  canvas.width = Math.max(
    minW,
    Math.floor(opt.width || canvas.width || PREVIEW_MIN.width)
  );
  canvas.height = Math.max(
    minH,
    Math.floor(opt.height || canvas.height || PREVIEW_MIN.height)
  );

  const ctx = canvas.getContext("2d");
  if (!is2DContext(ctx))
    throw new Error("2D context not available on destination canvas.");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const color = opt.color ?? DEFAULT_COLOR;

  // Slimmer body for pencil mode
  const baseRadiusRaw = Math.max(0.5, (opt.baseSizePx || 8) * 0.5);
  const baseRadius = opt.overrides?.centerlinePencil
    ? Math.max(0.5, baseRadiusRaw * PENCIL_TUNING.bodyWidthScale)
    : baseRadiusRaw;

  // Spacing: fraction of radius — a bit tighter to remove stepping
  const spacing = Math.max(0.1, opt.overrides?.spacing ?? 0.28) * baseRadius;

  // Build or use provided path
  const rawPath =
    opt.path && opt.path.length > 1
      ? opt.path
      : defaultPath(canvas.width, canvas.height);
  const samples = resample(rawPath, spacing);
  if (!samples.length) return;

  // Optional positional jitter
  const jitter = opt.overrides?.jitter ?? 0;
  const rnd = seededRand((opt.seed ?? 7) * 7919 + 11);

  // Fallback simple brush if pencil not enabled
  if (!opt.overrides?.centerlinePencil) {
    ctx.fillStyle = color;
    for (const smp of samples) {
      const jx = jitter ? (rnd() * 2 - 1) * jitter : 0;
      const jy = jitter ? (rnd() * 2 - 1) * jitter : 0;
      ctx.beginPath();
      ctx.arc(smp.x + jx, smp.y + jy, baseRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  // Pencil parameters
  const taperLen = clamp(
    baseRadius * PENCIL_TUNING.taperRadiusFactor,
    PENCIL_TUNING.taperMin,
    PENCIL_TUNING.taperMax
  );
  const flow = clamp01((opt.overrides?.flow ?? 100) / 100);
  const rimPx = PENCIL_TUNING.rimPx;

  // --- AUTO edge hotness when not provided ---
  const provided = typeof opt.overrides?.edgeHotness === "number";
  const L = luminanceOfHex(color); // 0..1 (brighter color => higher L)
  const autoHotness = 1.15 + 0.85 * (1 - L); // 1.15–2.0, darker colors => hotter

  const hot = provided
    ? clamp((opt.overrides!.edgeHotness as number) / 100, 0, 3) // manual override
    : autoHotness; // automatic, color-based

  const rimAlpha = PENCIL_TUNING.rimAlpha * hot;

  const grainScale =
    opt.overrides?.grainScale ?? PENCIL_TUNING.grainScaleDefault;
  const grainDepth =
    opt.overrides?.grainKind === "none"
      ? 0
      : clamp01(
          (opt.overrides?.grainDepth ?? PENCIL_TUNING.grainDepthDefault * 100) /
            100
        );
  const grainRotateDeg = opt.overrides?.grainRotate ?? 0;
  const grainRotateRad = (grainRotateDeg * Math.PI) / 180;

  const totalLen = samples[samples.length - 1].s + spacing * 0.5;

  for (const smp of samples) {
    // Long, shallow end tapers
    const tStart = clamp01(smp.s / taperLen);
    const tEnd = clamp01((totalLen - smp.s) / taperLen);
    const taper = Math.min(easePow(tStart), easePow(tEnd));
    const endFade = easeOutCubic(Math.min(tStart, tEnd));

    const radius = Math.max(0.5, baseRadius * taper);
    const radiusFade = 0.65 + 0.35 * clamp01((radius - 0.9) / 1.2); // 0.65→1

    const tinyK = clamp01((1.2 - radius) / 1.2); // 1 at ≤1.2px → 0 by ~2.4px
    const edgeBandLocal = PENCIL_TUNING.edgeBandPx * (1 + 0.18 * tinyK);

    const bmp = await getPencilStamp(radius, color, {
      rimPx,
      rimAlpha, // already includes hotness
      grainScale,
      grainDepth,
      grainAnisoX: PENCIL_TUNING.grainAnisoX,
      grainAnisoY: PENCIL_TUNING.grainAnisoY,
      edgeBandPx: edgeBandLocal, // fixed band (restored)
      coreDarken: PENCIL_TUNING.coreDarken,
      flankLighten: PENCIL_TUNING.flankLighten,
      centerDarkenAlpha: PENCIL_TUNING.centerDarkenAlpha,
      squashY: PENCIL_TUNING.squashY,
      seed: (opt.seed ?? 7) + Math.floor(radius * 10),
      grainRotateRad,
      grainRotateDeg,
    });

    const jx = jitter ? (rnd() * 2 - 1) * jitter : 0;
    const jy = jitter ? (rnd() * 2 - 1) * jitter : 0;

    ctx.save();
    ctx.translate(smp.x + jx, smp.y + jy);
    ctx.rotate((opt.overrides?.angle ?? 0) + smp.angle + Math.PI / 2);

    // constant flow (restored)
    ctx.globalAlpha = flow;

    const w = bmp.width,
      h = bmp.height;
    const alphaJitter = 0.96 + 0.06 * (rnd() * 2 - 1); // ~±3%
    ctx.globalAlpha = flow * endFade * radiusFade * alphaJitter;
    ctx.drawImage(bmp, -w / 2, -h / 2);

    ctx.restore();
  }
}

// Optional adapter for older callers
export const renderBrushPreview = drawStrokeToCanvas;
export default drawStrokeToCanvas;
