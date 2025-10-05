// FILE: src/lib/brush/backends/utils/spray-helpers.ts
import type { RenderOptions } from "@/lib/brush/engine";
import type {
  InputQualityOpts,
  StrokePlacementOptions,
  Stamp,
} from "@backends/utils/stroke";
import { pathToStamps } from "@backends/utils/stroke";
import type { PressureMapOpts } from "@/lib/brush/core/pressure";

/** Clamp to [0,1]. */
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Build exact-optional inputQuality from opt.input (omit undefined keys entirely). */
export function buildInputQuality(
  opt: RenderOptions
): InputQualityOpts | undefined {
  const q = opt.input?.quality;
  if (!q) return undefined;

  const iq: Partial<InputQualityOpts> = {};
  if (typeof q.predictPx === "number") iq.predictPx = q.predictPx;
  if (typeof q.speedToSpacing === "number")
    iq.speedToSpacing = q.speedToSpacing;
  if (typeof q.minStepPx === "number") iq.minStepPx = q.minStepPx;

  return Object.keys(iq).length ? (iq as InputQualityOpts) : undefined;
}

/** Produce spray-like stamps (position, tangent, widthScale, pressure). */
export function makeStamps(
  opt: RenderOptions,
  spacingOverridePct?: number
): Stamp[] {
  // Resolve spacing/jitter/scatter with safe defaults
  const spacingPercent = ((): number => {
    const v =
      spacingOverridePct ??
      opt.engine.strokePath?.spacing ??
      opt.engine.overrides?.spacing ??
      6;
    return typeof v === "number" ? v : 6;
  })();

  const jitterPercent = ((): number => {
    const v =
      opt.engine.strokePath?.jitter ?? opt.engine.overrides?.jitter ?? 0.5;
    // pathToStamps expects % (0..100)
    return (typeof v === "number" ? v : 0.5) * 100;
  })();

  const scatterPx = ((): number => {
    const v =
      opt.engine.strokePath?.scatter ?? opt.engine.overrides?.scatter ?? 0;
    return typeof v === "number" ? v : 0;
  })();

  // Optional pressure mapping from input (only attach when keys exist)
  const pressureMap: PressureMapOpts | undefined = (():
    | PressureMapOpts
    | undefined => {
    const input = opt.input;
    if (!input) return undefined;

    const gamma =
      input.pressure.curve?.type === "gamma"
        ? input.pressure.curve.gamma
        : undefined;

    const deadZone =
      typeof input.pressure.clamp?.min === "number"
        ? Math.max(0, Math.min(0.5, input.pressure.clamp.min))
        : undefined;

    const pm: Partial<PressureMapOpts> = {};
    if (typeof gamma === "number") pm.gamma = gamma;
    if (typeof deadZone === "number") pm.deadZone = deadZone;

    return Object.keys(pm).length ? (pm as PressureMapOpts) : undefined;
  })();

  const iq = buildInputQuality(opt);

  // Minimal, but well-formed placement options; everything else is optional.
  const baseOpts: StrokePlacementOptions = {
    baseSizePx: typeof opt.baseSizePx === "number" ? opt.baseSizePx : 12,
    spacingPercent,
    jitterPercent,
    scatterPx,
    stampsPerStep: 1,
    streamline: opt.engine.strokePath?.streamline ?? 0,
    angleFollowDirection: 0,
    angleJitterDeg: 0,
    tipMinPx: 0,
    tipScaleStart: 0.95,
    tipScaleEnd: 0.95,
    taperProfileStart: "linear",
    taperProfileEnd: "linear",
    endBias: 0,
    uniformity: 0,
    // rng is optional; omit to use Math.random() internally
    // pressureMap & inputQuality are added conditionally below
  };

  return pathToStamps(opt.path ?? [], {
    ...baseOpts,
    ...(pressureMap ? { pressureMap } : {}),
    ...(iq ? { inputQuality: iq } : {}),
  });
}
