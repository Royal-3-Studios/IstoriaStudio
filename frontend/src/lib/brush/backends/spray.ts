// FILE: src/lib/brush/backends/spray.ts
/**
 * Spray backend — airbrush-like dots distributed along a resampled path.
 * Canvas-based (manages its own DPR transform). No `any`, no Mathx.
 */

import type { RenderOptions, RenderPathPoint } from "@/lib/brush/engine";
import {
  Rand,
  Stroke as StrokeUtil,
  CanvasUtil,
  Texture as TexUtil,
  Blend,
} from "@backends";

type Ctx2D = CanvasUtil.Ctx2D;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/* ========================================================================== *
 * Context helpers (narrow to real 2D)
 * ========================================================================== */

function isCtx2D(
  ctx: unknown
): ctx is CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  if (!ctx || typeof ctx !== "object") return false;
  const c = ctx as Partial<CanvasRenderingContext2D>;
  return (
    typeof c.clearRect === "function" &&
    typeof c.setTransform === "function" &&
    typeof c.drawImage === "function" &&
    typeof c.putImageData === "function"
  );
}

function get2D(canvas: HTMLCanvasElement | OffscreenCanvas): Ctx2D {
  const ctx = canvas.getContext("2d");
  if (!isCtx2D(ctx)) throw new Error("2D context not available.");
  return ctx as Ctx2D;
}

/* ========================================================================== *
 * Path resampling (prefers shared StrokeUtil; falls back locally)
 * ========================================================================== */

type Sample = { x: number; y: number; t: number; p: number; ang: number };

function resamplePath(
  pts: ReadonlyArray<RenderPathPoint>,
  stepPx: number
): Sample[] {
  if (StrokeUtil?.resamplePath) {
    const base = StrokeUtil.resamplePath(
      pts as RenderPathPoint[],
      stepPx
    ) as Array<{
      x: number;
      y: number;
      t: number;
      p: number;
      angle?: number;
    }>;
    const out: Sample[] = [];
    for (let i = 0; i < base.length; i++) {
      const a = base[Math.max(0, i - 1)];
      const b = base[Math.min(base.length - 1, i + 1)];
      const ang =
        typeof base[i].angle === "number"
          ? (base[i].angle as number)
          : Math.atan2(b.y - a.y, b.x - a.x);
      out.push({ x: base[i].x, y: base[i].y, t: base[i].t, p: base[i].p, ang });
    }
    return out;
  }

  // Local fallback
  const out: Sample[] = [];
  if (pts.length < 2) return out;

  const N = pts.length;
  const segLen: number[] = new Array(N).fill(0);
  let total = 0;
  for (let i = 1; i < N; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const L = Math.hypot(dx, dy);
    segLen[i] = L;
    total += L;
  }
  if (total <= 0) return out;

  const prefix: number[] = new Array(N).fill(0);
  for (let i = 1; i < N; i++) prefix[i] = prefix[i - 1] + segLen[i];

  function posAt(sArc: number): {
    x: number;
    y: number;
    p: number;
    ang: number;
  } {
    const s = Math.max(0, Math.min(total, sArc));
    let idx = 1;
    while (idx < N && prefix[idx] < s) idx++;
    const i0 = Math.max(1, idx);
    const s0 = prefix[i0 - 1];
    const L = segLen[i0];
    const u = L > 0 ? (s - s0) / L : 0;

    const a = pts[i0 - 1];
    const b = pts[i0];
    const x = a.x + (b.x - a.x) * u;
    const y = a.y + (b.y - a.y) * u;
    const ap = typeof a.pressure === "number" ? clamp01(a.pressure) : 0.7;
    const bp = typeof b.pressure === "number" ? clamp01(b.pressure) : 0.7;
    const p = lerp(ap, bp, u);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    return { x, y, p, ang };
  }

  const step = Math.max(0.6, Math.min(3.0, stepPx));
  for (let s = 0; s <= total; s += step) {
    const r = posAt(s);
    out.push({
      x: r.x,
      y: r.y,
      t: total > 0 ? s / total : 0,
      p: r.p,
      ang: r.ang,
    });
  }
  if (out.length && out[out.length - 1].t < 1) {
    const r = posAt(total);
    out.push({ x: r.x, y: r.y, t: 1, p: r.p, ang: r.ang });
  }
  return out;
}

/* ========================================================================== *
 * Spray dot painters
 * ========================================================================== */

function paintDot(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  alpha: number
): void {
  if (r <= 0 || alpha <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function gaussianRadius(baseR: number, rnd: () => number): number {
  const u = rnd();
  const v = rnd();
  const z =
    Math.sqrt(-2.0 * Math.log(Math.max(1e-6, u))) * Math.cos(2 * Math.PI * v);
  const k = 0.35;
  return Math.max(0.1, baseR * (1 + k * z));
}

/* ========================================================================== *
 * Main renderer (canvas-based)
 * ========================================================================== */

export async function drawSprayToCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opt: RenderOptions
): Promise<void> {
  const path = opt.path ?? [];

  const dpr =
    typeof window !== "undefined"
      ? Math.min(opt.pixelRatio ?? window.devicePixelRatio ?? 1, 2)
      : Math.max(1, opt.pixelRatio ?? 1);

  const viewW = Math.max(1, Math.floor(opt.width));
  const viewH = Math.max(1, Math.floor(opt.height));

  // Resize backing store (device pixels)
  const wantW = Math.floor(viewW * dpr);
  const wantH = Math.floor(viewH * dpr);
  if (canvas.width !== wantW || canvas.height !== wantH) {
    canvas.width = wantW;
    canvas.height = wantH;
  }

  const ctx = get2D(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (path.length < 2) return;

  const ov = opt.engine.overrides ?? {};
  const flow01 = clamp01(((ov.flow ?? 100) as number) / 100);
  const opacity01 = clamp01(((ov.opacity ?? 100) as number) / 100);

  const baseR = Math.max(0.25, (opt.baseSizePx || 6) * 0.35);

  // Jitter is a FRACTION (0..1) of the *spacing step*, not a percent.
  const jitterFrac = clamp01(
    (opt.engine.strokePath?.jitter ?? ov.jitter ?? 0.5) as number
  );

  const scatterPx = Math.max(
    0,
    (opt.engine.strokePath?.scatter ?? ov.scatter ?? 0) as number
  );
  const countPerStep = Math.max(
    1,
    Math.round((opt.engine.strokePath?.count ?? ov.count ?? 16) as number)
  );

  // Spacing can be percent (>1 → %), or direct fraction (<=1)
  const uiSpacing = opt.engine.strokePath?.spacing ?? ov.spacing ?? 6;
  const spacingFrac =
    typeof uiSpacing === "number"
      ? uiSpacing > 1
        ? clamp(uiSpacing / 100, 0.01, 0.35)
        : clamp(uiSpacing, 0.01, 0.35)
      : 0.06;
  const stepPx = Math.max(
    0.6,
    Math.min(3.5, (opt.baseSizePx || 6) * spacingFrac)
  );

  const samples = resamplePath(path, stepPx);
  if (!samples.length) return;

  const seed = (opt.seed ?? 1337) >>> 0;
  const rng = Rand.mulberry32(seed);
  const rand = (): number => rng.nextFloat();

  const radialFalloff = 1.45;
  const sizePressureExp = 0.85;
  const alphaPressureExp = 1.2;

  const useGrain = (opt.engine.grain?.kind ?? "none") !== "none";
  const grainScale = opt.engine.grain?.scale ?? 1.0;
  const grainRotateDeg = opt.engine.grain?.rotate ?? 0;

  // Build mask/color layers in device pixels, draw in CSS coords via setTransform
  const maskCanvas = CanvasUtil.createLayer(canvas.width, canvas.height);
  const mx = get2D(maskCanvas);
  mx.setTransform(dpr, 0, 0, dpr, 0, 0);
  mx.clearRect(0, 0, viewW, viewH);

  const colorLayer = CanvasUtil.createLayer(canvas.width, canvas.height);
  const cx = get2D(colorLayer);
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx.clearRect(0, 0, viewW, viewH);

  const color = opt.color ?? "#000000";

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];

    // Jitter along the tangent as a fraction of the step size
    const alongJitter = (rand() * 2 - 1) * jitterFrac * stepPx;

    const nx = -Math.sin(s.ang);
    const ny = Math.cos(s.ang);

    for (let k = 0; k < countPerStep; k++) {
      const rr = Math.pow(rand(), radialFalloff);
      const ang = rand() * Math.PI * 2;
      const rScatter = rr * (scatterPx + stepPx * 0.5);

      const ox = Math.cos(ang) * rScatter + nx * alongJitter;
      const oy = Math.sin(ang) * rScatter + ny * alongJitter;

      const px = s.x + ox;
      const py = s.y + oy;

      const pr = Math.pow(clamp01(s.p), sizePressureExp);
      const rBase = baseR * (0.6 + 0.9 * pr);
      const radius = gaussianRadius(rBase, rand);

      const alpha =
        flow01 *
        Math.pow(clamp01(s.p), alphaPressureExp) *
        lerp(0.75, 1.0, rand());

      paintDot(mx, px, py, radius, "#000", 1.0);
      paintDot(cx, px, py, radius, color, alpha);
    }
  }

  // Clip the color by the mask
  Blend.withComposite(cx, "destination-in", () => {
    cx.drawImage(maskCanvas, 0, 0);
  });

  if (useGrain) {
    const tileSize = Math.max(
      24,
      Math.round(((opt.baseSizePx || 6) * 6) / Math.max(0.35, grainScale))
    );

    const tex = TexUtil.generateFbmNoiseTexture(
      clamp(tileSize, 24, 256),
      4,
      0.5,
      2.0
    );

    const tile = CanvasUtil.createLayer(tex.width, tex.height);
    const tx = get2D(tile);
    const id = new ImageData(tex.pixels.data, tex.width, tex.height);
    tx.putImageData(id, 0, 0);

    const rot = (grainRotateDeg * Math.PI) / 180;

    const grainLayer = CanvasUtil.createLayer(canvas.width, canvas.height);
    const gx = get2D(grainLayer);
    gx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gx.clearRect(0, 0, viewW, viewH);

    gx.save();
    const head = samples[0];
    gx.translate(head.x, head.y);
    gx.rotate(rot);
    gx.translate(-head.x, -head.y);

    const pat = gx.createPattern(
      tile as unknown as CanvasImageSource,
      "repeat"
    );
    if (pat) {
      gx.fillStyle = pat;
      gx.globalAlpha = 0.22 * flow01;
      gx.fillRect(0, 0, viewW, viewH);
    }
    gx.restore();

    Blend.withComposite(gx, "destination-in", () => {
      gx.drawImage(maskCanvas, 0, 0);
    });

    Blend.withComposite(cx, "multiply", () => {
      cx.drawImage(grainLayer, 0, 0);
    });
  }

  Blend.withCompositeAndAlpha(ctx, "source-over", opacity01, () => {
    ctx.drawImage(colorLayer, 0, 0);
  });
}

export default drawSprayToCanvas;
