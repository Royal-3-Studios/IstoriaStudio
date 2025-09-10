// src/lib/brush/backends/stamping.ts
/**
 * Stamping backend: places tip shapes along the path using spacing/jitter/scatter/count.
 * - Honors: spacing, jitter, scatter, count, angle, softness (from hardness), flow, grain*
 * - Tip: analytic oval with roundness/softness; can be swapped for image later.
 */

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

type EngineShape = {
  type?: "oval" | "round" | "nib" | "image";
  roundness?: number; // 0..100
  softness?: number; // 0..100
  angle?: number; // deg
  sizeScale?: number; // scalar
};

type EngineStrokePath = {
  spacing?: number; // %
  jitter?: number; // %
  scatter?: number; // px
  count?: number; // stamps per step
  streamline?: number; // %
};

type EngineGrain = {
  kind?: "none" | "paper" | "canvas" | "noise";
  depth?: number; // 0..100
  scale?: number; // 0.5..3
  rotate?: number; // deg
};

type EngineConfig = {
  shape?: EngineShape;
  strokePath?: EngineStrokePath;
  grain?: EngineGrain;
};

type RenderOverrides = Partial<{
  spacing: number;
  jitter: number;
  scatter: number;
  count: number;
  angle: number; // deg
  softness: number; // 0..100
  flow: number; // 0..100
  grainKind: "none" | "paper" | "canvas" | "noise";
  grainScale: number; // 0.5..3
  grainDepth: number; // 0..100
  grainRotate: number; // deg
}>;

type RenderOptions = {
  engine: EngineConfig;
  baseSizePx: number;
  color?: string;
  width: number;
  height: number;
  seed?: number;
  path?: Array<{ x: number; y: number; angle?: number }>;
  colorJitter?: { h?: number; s?: number; l?: number; perStamp?: boolean };
  overrides?: RenderOverrides;
};

const DEFAULT_COLOR = "#000000";
const PREVIEW_MIN = { width: 352, height: 128 };

// ------------- utils -------------
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function seededRand(seed: number) {
  let x = seed || 123456789;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  };
}

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  throw new Error("No canvas implementation available.");
}

function is2DContext(ctx: unknown): ctx is Ctx2D {
  if (!ctx || typeof ctx !== "object") return false;
  const c = ctx as Record<string, unknown>;
  return typeof c.drawImage === "function" && "canvas" in c;
}

function get2DContext(c: OffscreenCanvas | HTMLCanvasElement): Ctx2D {
  const ctx = c.getContext("2d");
  if (!is2DContext(ctx)) throw new Error("2D context not available.");
  return ctx;
}

function makeNoiseTile(size = 64, seed = 1) {
  const c = makeCanvas(size, size);
  const ctx = get2DContext(c);
  const img = ctx.createImageData(size, size);
  const rnd = seededRand(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (rnd() * 0.6 + rnd() * 0.4) * 255;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ------------- path helpers -------------
function defaultPath(w: number, h: number) {
  const pts: Array<{ x: number; y: number; angle: number }> = [];
  const x0 = Math.max(6, Math.floor(w * 0.06));
  const x1 = Math.min(w - 6, Math.floor(w * 0.94));
  const midY = Math.floor(h * 0.6);
  const amp = Math.max(6, Math.min(h * 0.35, 32));
  const steps = 72;
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

function resampleUniform(
  path: Array<{ x: number; y: number; angle?: number }>,
  step: number
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
  for (let d = 0; d <= L; d += step) {
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

// ------------- tip rendering -------------
function drawSoftOvalTip(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  sizePx: number,
  roundness: number, // 0..100 (0 = long ellipse, 100 = circle)
  softness: number, // 0..100 (edge softness)
  rotationRad: number, // radians
  alpha: number // 0..1
) {
  const rx = sizePx * 0.5 * (1 - (1 - roundness / 100) * 0.6);
  const ry = sizePx * 0.5 * (1 - (roundness / 100) * 0.0);
  const blurPx = Math.max(0.1, (softness / 100) * (sizePx * 0.25));

  (ctx as CanvasRenderingContext2D).filter = `blur(${blurPx.toFixed(3)}px)`;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotationRad);
  ctx.beginPath();
  // approximate oval by scaled circle
  ctx.scale(rx / Math.max(1e-3, ry), 1);
  ctx.arc(0, 0, ry, 0, Math.PI * 2);
  ctx.restore();

  ctx.globalAlpha = alpha;
  ctx.fillStyle = "black";
  ctx.fill();
  (ctx as CanvasRenderingContext2D).filter = "none";
}

// ------------- main -------------
export async function drawStampingToCanvas(
  canvas: HTMLCanvasElement,
  opt: RenderOptions
): Promise<void> {
  const dpr =
    typeof window !== "undefined"
      ? Math.max(1, window.devicePixelRatio || 1)
      : 1;

  const targetW = Math.max(1, Math.floor(opt.width || PREVIEW_MIN.width));
  const targetH = Math.max(1, Math.floor(opt.height || PREVIEW_MIN.height));

  if (canvas instanceof HTMLCanvasElement) {
    canvas.style.width = `${targetW}px`;
    canvas.style.height = `${targetH}px`;
  }
  canvas.width = Math.max(1, Math.floor(targetW * dpr));
  canvas.height = Math.max(1, Math.floor(targetH * dpr));

  const ctx = canvas.getContext("2d");
  if (!is2DContext(ctx)) throw new Error("2D context not available.");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, targetW, targetH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const color = opt.color ?? DEFAULT_COLOR;
  void color; // reserved for color variants

  const baseSizePx = Math.max(0.5, opt.baseSizePx || 8);

  // path & samples
  const rawPath =
    opt.path && opt.path.length > 1 ? opt.path : defaultPath(targetW, targetH);

  // spacing in pixels = percentage of diameter (UI 1..100)
  const spacingPct =
    opt.overrides?.spacing ?? opt.engine?.strokePath?.spacing ?? 4; // %
  const spacingPx = Math.max(0.25, (spacingPct / 100) * baseSizePx);

  const samples = resampleUniform(rawPath, spacingPx);
  if (!samples.length) return;

  // jitter/scatter/count
  const rnd = seededRand((opt.seed ?? 7) * 7919 + 13);
  const jitter =
    (opt.overrides?.jitter ?? opt.engine?.strokePath?.jitter ?? 0) / 100; // 0..1
  const scatter =
    opt.overrides?.scatter ?? opt.engine?.strokePath?.scatter ?? 0; // px
  const count = Math.max(
    1,
    Math.round(opt.overrides?.count ?? opt.engine?.strokePath?.count ?? 1)
  );

  // tip shape settings
  const shape = opt.engine?.shape ?? {};
  const roundness = clamp(shape.roundness ?? 50, 0, 100);
  const softness = clamp(
    opt.overrides?.softness ?? shape.softness ?? 50,
    0,
    100
  );
  const baseAngleDeg = opt.overrides?.angle ?? shape.angle ?? 0;
  const baseAngle = (baseAngleDeg * Math.PI) / 180;

  // flow/opacity
  const flow = clamp01((opt.overrides?.flow ?? 100) / 100);

  // grain (stroke-anchored, simple multiply)
  const grainKind =
    opt.overrides?.grainKind ?? opt.engine?.grain?.kind ?? "paper";
  const grainDepth = clamp01(
    (opt.overrides?.grainDepth ?? opt.engine?.grain?.depth ?? 0) / 100
  );
  const grainScale =
    opt.overrides?.grainScale ?? opt.engine?.grain?.scale ?? 1.0;
  const grainRotateDeg =
    opt.overrides?.grainRotate ?? opt.engine?.grain?.rotate ?? 0;
  const grainRotateRad = (grainRotateDeg * Math.PI) / 180;

  const grainTile =
    grainKind === "none"
      ? null
      : makeNoiseTile(64, 31 * ((opt.seed ?? 7) % 997) + 7);

  // stamping loop
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    // per-sample base rotation
    const rot = s.angle + baseAngle;

    // draw multiple stamps per sample if count>1 (fan across the normal)
    for (let c = 0; c < count; c++) {
      // base pos
      let px = s.x;
      let py = s.y;

      // jitter along tangent
      const j = jitter * spacingPx * (rnd() * 2 - 1);
      px += Math.cos(s.angle) * j;
      py += Math.sin(s.angle) * j;

      // scatter along normal (and slight random)
      const nx = -Math.sin(s.angle);
      const ny = Math.cos(s.angle);
      const sc = (scatter * (c - (count - 1) / 2)) / Math.max(1, count - 1);
      const scRand = scatter * 0.25 * (rnd() * 2 - 1);
      px += nx * (sc + scRand);
      py += ny * (sc + scRand);

      // size (can be modulated via dynamics later)
      const sizePx = baseSizePx;

      // tip alpha per-stamp
      const alpha = flow;

      // tip rotation — add small random spin for organic feel
      const stampRot = rot + (rnd() - 0.5) * 0.15;

      // draw the tip
      drawSoftOvalTip(
        ctx,
        px,
        py,
        sizePx,
        roundness,
        softness,
        stampRot,
        alpha
      );

      // grain multiply (inside stamp bounds) — very simple, stroke-anchored
      if (grainTile && grainDepth > 0.001) {
        ctx.save();
        ctx.globalCompositeOperation = "multiply";
        ctx.translate(px, py);
        ctx.rotate(grainRotateRad);
        // scale grain tile — larger 'scale' means finer look
        const W = Math.max(
          16,
          Math.ceil((targetW + targetH) / Math.max(0.5, grainScale))
        );
        ctx.globalAlpha = grainDepth * 0.22;
        ctx.drawImage(grainTile, -W / 2, -W / 2, W, W);
        ctx.restore();
      }
    }
  }
}

export default drawStampingToCanvas;
