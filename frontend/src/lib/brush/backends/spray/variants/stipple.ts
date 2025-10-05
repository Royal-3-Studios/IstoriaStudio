// src/lib/brush/backends/spray/variants/stipple.ts
import type { RenderOptions } from "@/lib/brush/engine";
import type { Ctx2D } from "@backends/utils/canvas";
import { Rand, Blend } from "@backends";
import { pathToStamps } from "@backends/utils/stroke";
import type { PressureMapOpts } from "@/lib/brush/core/pressure";
import type { InputQualityOpts } from "@backends/utils/stroke";
import { createLayer, get2D } from "@backends/utils/canvas";
import { gaussianRadius, paintDot } from "../core/dots";

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

/** Build PressureMapOpts BUT only include defined keys (exactOptionalPropertyTypes-safe). */
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

  const out: Partial<PressureMapOpts> = {};
  if (gamma !== undefined) out.gamma = gamma;
  if (deadZone !== undefined) out.deadZone = deadZone;

  return Object.keys(out).length ? (out as PressureMapOpts) : undefined;
}

/** Build InputQualityOpts with only present keys (no `undefined` properties). */
function toInputQuality(opt: RenderOptions): InputQualityOpts | undefined {
  const q = opt.input?.quality;
  if (!q) return undefined;

  const out: Partial<InputQualityOpts> = {};
  if (typeof q.predictPx === "number") out.predictPx = q.predictPx;
  if (typeof q.speedToSpacing === "number")
    out.speedToSpacing = q.speedToSpacing;
  if (typeof q.minStepPx === "number") out.minStepPx = q.minStepPx;

  return Object.keys(out).length ? (out as InputQualityOpts) : undefined;
}

/** Sparse, larger dots (pointillist/stipple). */
export function drawSprayStipple(ctx: Ctx2D, opt: RenderOptions): void {
  const path = opt.path ?? [];
  const viewW = Math.max(1, Math.floor(opt.width));
  const viewH = Math.max(1, Math.floor(opt.height));
  if (path.length < 2) return;

  const flow01 = clamp01(((opt.engine.overrides?.flow ?? 100) as number) / 100);
  const opacity01 = clamp01(
    ((opt.engine.overrides?.opacity ?? 100) as number) / 100
  );

  const spacingPercent = (opt.engine.strokePath?.spacing ??
    (opt.engine.overrides?.spacing as number | undefined) ??
    9) as number;

  const scatterPx = (opt.engine.strokePath?.scatter ??
    (opt.engine.overrides?.scatter as number | undefined) ??
    2) as number;

  const seed = (opt.seed ?? 4242) >>> 0;
  const rng = Rand.mulberry32(seed);
  const rand = (): number => rng.nextFloat();

  const pmap = toPressureMapFromInput(opt);
  const inputQuality = toInputQuality(opt);

  const stamps = pathToStamps(path, {
    baseSizePx: opt.baseSizePx,
    spacingPercent,
    jitterPercent: 30, // looser
    scatterPx,
    stampsPerStep: 1,
    streamline: opt.engine.strokePath?.streamline ?? 0,
    angleFollowDirection: 0,
    angleJitterDeg: 0,
    tipMinPx: 0,
    tipScaleStart: 0.9,
    tipScaleEnd: 0.9,
    taperProfileStart: "linear",
    taperProfileEnd: "linear",
    endBias: 0,
    uniformity: 1, // flat, marker-like weighting for dot size
    rng,
    ...(pmap ? { pressureMap: pmap } : {}),
    ...(inputQuality ? { inputQuality } : {}),
  });
  if (!stamps.length) return;

  const color = opt.color ?? "#000000";
  const baseR = Math.max(0.25, (opt.baseSizePx || 8) * 0.5);

  const layer = createLayer(viewW, viewH);
  const lx = get2D(layer);
  lx.clearRect(0, 0, viewW, viewH);

  // Use for..of, or non-null assertion on index access to keep TS happy.
  for (const s of stamps) {
    // sparse: ~1–2 dots per stamp
    const dots = 1 + (rand() < s.pressure ? 1 : 0);
    for (let k = 0; k < dots; k++) {
      const ang = rand() * Math.PI * 2;
      const d = (scatterPx + 2) * rand();
      const px = s.x + Math.cos(ang) * d;
      const py = s.y + Math.sin(ang) * d;

      const r = gaussianRadius(baseR * (0.7 + 1.0 * s.pressure), rand);
      const a = flow01 * (0.5 + 0.5 * s.pressure);
      paintDot(lx, px, py, r, color, a);
    }
  }

  Blend.withCompositeAndAlpha(ctx, "source-over", opacity01, () => {
    ctx.drawImage(layer, 0, 0);
  });
}
