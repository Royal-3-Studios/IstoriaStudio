// src/lib/brush/engine.ts
/**
 * Procreate-style 6B pencil via cached offscreen stamps (strict TS).
 * - Dark center + gentle flanks (linear “spine” + small radial “plate”)
 * - Dual hairline bright rims (screen), rim scales with radius at tips
 * - Added soft sheen ring near the rim (screen)
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
  }>;
};

const DEFAULT_COLOR = "#000000";
const PREVIEW_MIN = { width: 352, height: 128 };

/** Tuned toward the Procreate 6B sample */
const PENCIL_TUNING = {
  bodyWidthScale: 0.36,
  taperMin: 100,
  taperMax: 170,
  taperRadiusFactor: 10,

  // hairline rim (baseline; per-stamp thickness scales with radius)
  rimPx: 0.32,
  rimAlpha: 1,
  rimRGB: "255,255,255",

  // crisp AA band
  edgeBandPx: 0.28,

  // darker middle, almost no flank lift
  coreDarken: 0.95,
  flankLighten: 0.0,
  centerDarkenAlpha: 1,

  // grain (avoid mottled near-black)
  grainDepthDefault: 0.18,
  grainScaleDefault: 1.6,
  grainAnisoX: 0.65,
  grainAnisoY: 1.4,

  squashY: 0.84,
} as const;

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type StampSource = ImageBitmap | OffscreenCanvas | HTMLCanvasElement; // all have width/height
type StampKey = string;

/** Cache + schema bump to force rebuilds when shading logic changes */
const STAMP_CACHE = new Map<StampKey, StampSource>();
const STAMP_SCHEMA = 20; // bumped

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

  // Base color shaping: darker center base, gently lighter flanks
  const rgbBase = darkenRGB(hexToRgb(colorHex), opts.coreDarken);
  const core = rgbToCss(rgbBase, 1);
  const coreLite = rgbToCss(lightenRGB(rgbBase, opts.flankLighten), 1);

  // 1) Core (lateral gradient) — clip to circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.clip();

  const g = ctx.createLinearGradient(-radius, 0, radius, 0);
  g.addColorStop(0.0, coreLite);
  g.addColorStop(0.35, core);
  const plateauHalfPx = 0.1;
  const plateauHalf = Math.min(0.04, plateauHalfPx / (radius * 2)); // convert px → [0..1]
  g.addColorStop(0.5 - plateauHalf, "rgba(0,0,0,1)");
  g.addColorStop(0.5 + plateauHalf, "rgba(0,0,0,1)");
  g.addColorStop(0.65, core);
  g.addColorStop(1.0, coreLite);
  ctx.fillStyle = g;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);

  // 1b) Subtle radial center darken so rims pop
  if (opts.centerDarkenAlpha > 0) {
    ctx.globalCompositeOperation = "multiply";
    const rgCenter = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.9);
    rgCenter.addColorStop(0, `rgba(0,0,0,${opts.centerDarkenAlpha})`);
    rgCenter.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rgCenter;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.globalCompositeOperation = "source-over";
  }

  // 1d) Center spine — very narrow, strong (drives near-black middle)
  ctx.globalCompositeOperation = "multiply";
  {
    const spine = ctx.createLinearGradient(-radius, 0, radius, 0);

    // Half-width of the spine in *pixels*
    const spineHalfPx = 0.12;

    // Convert px → gradient-stop fraction of the full width (2*radius)
    const spineHalf = Math.max(
      0.002,
      Math.min(0.05, spineHalfPx / (radius * 2))
    );

    spine.addColorStop(0.0, "rgba(0,0,0,0)");
    spine.addColorStop(0.5 - spineHalf, "rgba(0,0,0,0)");
    spine.addColorStop(0.5, "rgba(0,0,0,0.94)"); // near-black seam
    spine.addColorStop(0.5 + spineHalf, "rgba(0,0,0,0)");
    spine.addColorStop(1.0, "rgba(0,0,0,0)");

    ctx.fillStyle = spine;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  }
  ctx.globalCompositeOperation = "source-over";

  // 1f) Core floor — gentle wide darken, does NOT reach the rim
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

  // 1e) Center plate — small radial deepen so the core reads near-black
  ctx.globalCompositeOperation = "multiply";
  {
    const plate = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.7);
    plate.addColorStop(0, "rgba(0,0,0,0.8)");
    plate.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = plate;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  }
  ctx.globalCompositeOperation = "source-over";

  // 1c) Inner trough — dark ring just inside the rim (contrast for rim)
  ctx.globalCompositeOperation = "multiply";
  {
    const startR = Math.max(0, radius - 0.62);
    const endR = Math.max(0, radius - 0.17);
    const rgTrough = ctx.createRadialGradient(0, 0, startR, 0, 0, endR);
    rgTrough.addColorStop(0, "rgba(0,0,0,0)");
    rgTrough.addColorStop(1, "rgba(0,0,0,0.62)");
    ctx.fillStyle = rgTrough;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  }
  ctx.globalCompositeOperation = "source-over";

  // 2) Dual bright rims (hairline), airy — first pass
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = `rgba(${PENCIL_TUNING.rimRGB},1)`;
  // keep rim truly hairline at tips
  const rim = Math.max(0.28, Math.min(opts.rimPx, radius * 0.4));
  // “Left” bar (top rim after rotation)
  ctx.globalAlpha = Math.min(1, opts.rimAlpha * 1.25);
  ctx.fillRect(-radius + rim * 0.25, -radius, rim, radius * 2);
  // “Right” bar (bottom rim)
  ctx.globalAlpha = Math.min(1, opts.rimAlpha * 0.85);
  ctx.fillRect(+radius - rim * 1.25, -radius, rim, radius * 2);
  ctx.globalAlpha = 1;

  // 2b) Soft sheen ring just inside rim (adds Procreate-like edge brightening)
  {
    ctx.globalCompositeOperation = "screen";
    const r0 = Math.max(0, radius - 0.95);
    const r1 = radius + 0.05;
    const sheen = ctx.createRadialGradient(0, 0, r0, 0, 0, r1);
    sheen.addColorStop(0.0, "rgba(255,255,255,0.07)");
    sheen.addColorStop(0.6, "rgba(255,255,255,0.015)");
    sheen.addColorStop(1.0, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.globalCompositeOperation = "source-over";
  }

  // 3) Grain on the core only (multiply), slightly longitudinal
  if (opts.grainDepth > 0.001) {
    ctx.globalCompositeOperation = "multiply";
    const tile = makeNoiseTile(64, 31 * opts.seed + 7);
    const scale = Math.max(0.001, opts.grainScale); // larger => finer in our mapping
    const w = Math.max(8, Math.floor((radius * 2) / scale));
    ctx.save();
    ctx.rotate(opts.grainRotateRad);
    ctx.scale(opts.grainAnisoX, opts.grainAnisoY);
    ctx.drawImage(tile, 0, 0, tile.width, tile.height, -radius, -radius, w, w);
    ctx.restore();

    // slight contrast lift to make grain read without holes
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = opts.grainDepth * 0.1;
    ctx.fillStyle = "black";
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    ctx.globalAlpha = 1;
  }

  // 3b) Re-enforce center seam after grain so noise doesn't gray it
  ctx.globalCompositeOperation = "multiply";
  {
    const spine2 = ctx.createLinearGradient(-radius, 0, radius, 0);
    const spineHalfPx = 0.08; // micro width
    const spineHalf = Math.max(
      0.002,
      Math.min(0.05, spineHalfPx / (radius * 2))
    );
    spine2.addColorStop(0.0, "rgba(0,0,0,0)");
    spine2.addColorStop(0.5 - spineHalf, "rgba(0,0,0,0)");
    spine2.addColorStop(0.5, "rgba(0,0,0,0.955)");
    spine2.addColorStop(0.5 + spineHalf, "rgba(0,0,0,0)");
    spine2.addColorStop(1.0, "rgba(0,0,0,0)");
    ctx.fillStyle = spine2;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  }
  ctx.globalCompositeOperation = "source-over";

  // 4) Tight feather: push fade outward for airy rim / crisp silhouette
  const band = opts.edgeBandPx;
  const innerR2 = Math.max(0, radius - band * 0.0); // keep inside intact
  const outerR2 = radius + band * 0.58; // tiny outer halo → crisp edge
  ctx.globalCompositeOperation = "destination-in";
  const rg = ctx.createRadialGradient(0, 0, innerR2, 0, 0, outerR2);
  rg.addColorStop(0, "rgba(0,0,0,1)");
  rg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rg;
  ctx.fillRect(-radius - 2, -radius - 2, radius * 2 + 4, radius * 2 + 4);
  ctx.globalCompositeOperation = "source-over";

  // 5) Subtle longitudinal squash for ribbon blending
  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  ctx.ellipse(0, 0, radius, radius * opts.squashY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";

  // 6) Post-feather rim "reheat" (lifts highlight after AA mask)
  {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, radius, radius * opts.squashY, 0, 0, Math.PI * 2);
    ctx.clip();

    ctx.globalCompositeOperation = "screen";
    const rim2 = Math.max(0.26, Math.min(opts.rimPx, radius * 0.4));
    ctx.fillStyle = `rgba(${PENCIL_TUNING.rimRGB},1)`;

    // top (left after rotation) — a touch brighter
    ctx.globalAlpha = Math.min(1, opts.rimAlpha * 0.64); // was 0.58
    ctx.fillRect(-radius + rim2 * 0.25, -radius, rim2 * 0.9, radius * 2); // 0.98 → 0.94

    // bottom (right) — a touch dimmer
    ctx.globalAlpha = Math.min(1, opts.rimAlpha * 0.38); // was 0.42
    ctx.fillRect(+radius - rim2 * 1.25, -radius, rim2 * 0.9, radius * 2);

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
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
    STAMP_SCHEMA, // ensure cache bust on shading changes
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
  const spacing = Math.max(0.1, opt.overrides?.spacing ?? 0.36) * baseRadius;

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
  const rimAlpha = PENCIL_TUNING.rimAlpha;
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
    // Long, shallow end tapers (steeper ease for shorter, cleaner tips)
    const tStart = clamp01(smp.s / taperLen);
    const tEnd = clamp01((totalLen - smp.s) / taperLen);
    const taper = Math.min(easePow(tStart), easePow(tEnd));

    const radius = Math.max(0.5, baseRadius * taper);
    const bmp = await getPencilStamp(radius, color, {
      rimPx,
      rimAlpha,
      grainScale,
      grainDepth,
      grainAnisoX: PENCIL_TUNING.grainAnisoX,
      grainAnisoY: PENCIL_TUNING.grainAnisoY,
      edgeBandPx: PENCIL_TUNING.edgeBandPx,
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
    ctx.globalAlpha = flow;

    const w = bmp.width,
      h = bmp.height;
    ctx.drawImage(bmp, -w / 2, -h / 2);

    ctx.restore();
  }
}

// Optional adapter for older callers
export const renderBrushPreview = drawStrokeToCanvas;
export default drawStrokeToCanvas;
