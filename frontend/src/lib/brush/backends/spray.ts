// FILE: src/lib/brush/backends/spray.ts
/**
 * Spray backend — airbrush-like dots distributed along a resampled path.
 * Draws in CSS space (engine sets DPR). Uses pathToStamps to honor input.quality & pressure curve.
 */

import type { RenderOptions, RenderOverrides } from "@/lib/brush/engine";
import { Rand, CanvasUtil, Texture as TexUtil, Blend } from "@backends";

import { pathToStamps } from "@/lib/brush/backends/utils/stroke";
import type { PressureMapOpts } from "@/lib/brush/core/pressure";

type Ctx2D = CanvasUtil.Ctx2D;

/* ========================================================================== *
 * Utils
 * ========================================================================== */

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function isCtx2D(
  ctx: unknown
): ctx is CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  if (!ctx || typeof ctx !== "object") return false;
  const c = ctx as Partial<CanvasRenderingContext2D>;
  return (
    typeof c.clearRect === "function" &&
    typeof c.drawImage === "function" &&
    typeof c.putImageData === "function"
  );
}

function get2D(canvas: HTMLCanvasElement | OffscreenCanvas): Ctx2D {
  const ctx = canvas.getContext("2d");
  if (!isCtx2D(ctx)) throw new Error("2D context not available.");
  return ctx as Ctx2D;
}

/** standard gaussian radius jitter (Box–Muller) */
function gaussianRadius(baseR: number, rnd: () => number): number {
  const u = Math.max(1e-6, rnd());
  const v = Math.max(1e-6, rnd());
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  const k = 0.35;
  return Math.max(0.1, baseR * (1 + k * z));
}

/** soft round dot (circle fill; we layer many of them) */
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

/** derive PressureMapOpts from opt.input (gamma / deadZone if present) */
function toPressureMapFromInput(
  opt: RenderOptions
): PressureMapOpts | undefined {
  const input = opt.input;
  if (!input) return undefined;
  const gamma =
    input.pressure.curve?.type === "gamma"
      ? input.pressure.curve.gamma
      : undefined;
  const deadZone =
    typeof input.pressure.clamp?.min === "number"
      ? clamp(input.pressure.clamp.min, 0, 0.5)
      : undefined;
  if (gamma === undefined && deadZone === undefined) return undefined;
  return { gamma, deadZone };
}

/* ========================================================================== *
 * Main renderer (draw in CSS space; engine handles DPR)
 * ========================================================================== */

export async function drawSprayToCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opt: RenderOptions
): Promise<void> {
  const ctx = get2D(canvas);
  const path = opt.path ?? [];
  const viewW = Math.max(1, Math.floor(opt.width));
  const viewH = Math.max(1, Math.floor(opt.height));

  ctx.clearRect(0, 0, viewW, viewH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (path.length < 2) return;

  const ov = (opt.engine.overrides ?? {}) as Required<RenderOverrides>;
  const flow01 = clamp01(((ov.flow ?? 100) as number) / 100);
  const opacity01 = clamp01(((ov.opacity ?? 100) as number) / 100);

  // Treat count as "dots per step"
  const dotsPerStep = Math.max(
    1,
    Math.round((opt.engine.strokePath?.count ?? ov.count ?? 16) as number)
  );

  // Shared spacing inputs — use stroke sampler’s expectations (percent values)
  const spacingPercent = (opt.engine.strokePath?.spacing ??
    ov.spacing ??
    6) as number; // % if >1
  const jitterPercent =
    ((opt.engine.strokePath?.jitter ?? ov.jitter ?? 0.5) as number) * 100; // stroke.ts expects %
  const scatterPx = (opt.engine.strokePath?.scatter ??
    ov.scatter ??
    0) as number;

  // Angle controls (usually minimal for spray)
  const angleFollowDirection = (ov.angleFollowDirection ?? 0) as number;
  const angleJitterDeg = (ov.angleJitter ?? 0) as number;

  // Tip/body (not critical for spray, but harmless to pass through)
  const tipMinPx = (ov.tipMinPx ?? 0) as number;
  const tipScaleStart = (ov.tipScaleStart ?? 0.85) as number;
  const tipScaleEnd = (ov.tipScaleEnd ?? 0.85) as number;

  const endBias = (ov.endBias ?? 0) as number;
  const uniformity = (ov.uniformity ?? 0) as number;

  // Stable RNG for repeatability
  const seed = (opt.seed ?? 1337) >>> 0;
  const rng = Rand.mulberry32(seed);
  const rand = (): number => rng.nextFloat();

  // Pressure mapping + input-quality to feed stroke sampler
  const pmap = toPressureMapFromInput(opt);
  const inputQuality = {
    predictPx: opt.input?.quality?.predictPx,
    speedToSpacing: opt.input?.quality?.speedToSpacing,
    minStepPx: opt.input?.quality?.minStepPx,
  };

  // Generate along-path stamp placements (with jitter/scatter already applied)
  const stamps = pathToStamps(path, {
    baseSizePx: opt.baseSizePx,
    spacingPercent,
    jitterPercent,
    scatterPx,
    stampsPerStep: 1, // we'll use dotsPerStep below for density
    streamline: opt.engine.strokePath?.streamline ?? 0,
    angleFollowDirection,
    angleJitterDeg,
    tipMinPx,
    tipScaleStart,
    tipScaleEnd,
    taperProfileStart: ov.taperProfileStart ?? "linear",
    taperProfileEnd: ov.taperProfileEnd ?? "linear",
    endBias,
    uniformity,
    rng,
    pressureMap: pmap,
    inputQuality,
  });

  if (!stamps.length) return;

  const color = opt.color ?? "#000000";
  const baseR = Math.max(0.25, (opt.baseSizePx || 6) * 0.35);

  // Heuristics for size/alpha vs pressure
  const radialFalloff = 1.45; // distribution toward center
  const sizePressureExp = 0.85; // dot size vs pressure
  const alphaPressureExp = 1.2; // alpha vs pressure

  // Estimate step size from spacingPercent & base size (like stroke.ts)
  const stepPx = Math.max(
    0.6,
    (spacingPercent > 1 ? spacingPercent / 100 : spacingPercent) *
      (opt.baseSizePx || 6) // ensure a sane fallback
  );

  // Prepare mask/color layers (draw in CSS space)
  const maskCanvas = CanvasUtil.createLayer(viewW, viewH);
  const mx = get2D(maskCanvas);
  mx.clearRect(0, 0, viewW, viewH);

  const colorLayer = CanvasUtil.createLayer(viewW, viewH);
  const cx = get2D(colorLayer);
  cx.clearRect(0, 0, viewW, viewH);

  // Spray around each stamp center
  for (let i = 0; i < stamps.length; i++) {
    const s = stamps[i];

    // Radial cloud around the stamp
    for (let k = 0; k < dotsPerStep; k++) {
      const rr = Math.pow(rand(), radialFalloff);
      const ang = rand() * Math.PI * 2;

      // mix engine scatter with a small base tied to step size
      const rScatter = rr * (scatterPx + stepPx * 0.5);

      const px = s.x + Math.cos(ang) * rScatter;
      const py = s.y + Math.sin(ang) * rScatter;

      const pr = Math.pow(clamp01(s.pressure), sizePressureExp);
      const rBase = baseR * (0.6 + 0.9 * pr);
      const radius = gaussianRadius(rBase, rand);

      const alpha =
        flow01 *
        Math.pow(clamp01(s.pressure), alphaPressureExp) *
        lerp(0.75, 1.0, rand());

      paintDot(mx, px, py, radius, "#000", 1.0);
      paintDot(cx, px, py, radius, color, alpha);
    }
  }

  // Clip the color by the mask
  Blend.withComposite(cx, "destination-in", () => {
    cx.drawImage(maskCanvas, 0, 0);
  });

  // Optional paper/canvas grain
  const useGrain = (opt.engine.grain?.kind ?? "none") !== "none";
  if (useGrain) {
    const grainScale = opt.engine.grain?.scale ?? 1.0;
    const grainRotateDeg = opt.engine.grain?.rotate ?? 0;
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

    const grainLayer = CanvasUtil.createLayer(viewW, viewH);
    const gx = get2D(grainLayer);
    gx.clearRect(0, 0, viewW, viewH);

    // anchor grain orientation to stroke head if available
    const head = stamps[0];
    gx.save();
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

    // keep grain only where spray exists
    Blend.withComposite(gx, "destination-in", () => {
      gx.drawImage(maskCanvas, 0, 0);
    });

    // multiply onto color
    Blend.withComposite(cx, "multiply", () => {
      cx.drawImage(grainLayer, 0, 0);
    });
  }

  // Final composite to target (global blend/opacity still applied by engine)
  Blend.withCompositeAndAlpha(ctx, "source-over", opacity01, () => {
    ctx.drawImage(colorLayer, 0, 0);
  });
}

export default drawSprayToCanvas;
