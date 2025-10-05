// FILE: src/lib/brush/backends/spray/variants/splatter.ts
import type { RenderOptions, RenderOverrides } from "@/lib/brush/engine";
import { Rand, Blend } from "@backends";
import { pathToStamps } from "@backends/utils/stroke";
import type { PressureMapOpts } from "@/lib/brush/core/pressure";

import type { Ctx2D } from "@backends/utils/canvas";
import { gaussianRadius, paintDot } from "../core/dots";
import { newMask, newColorLayer, clipColorByMask } from "../core/mask";

type SplatterOverrides = Partial<{
  /** How often to emit a burst (in stamps). */
  burstEvery: number;
  /** How many extra large droplets per burst. */
  burstCount: number;
  /** Size multiplier for burst droplets. */
  burstSizeMul: number;
  /** Alpha clamps for per-dot tint. */
  alphaMin: number;
  alphaMax: number;
}>;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

/** Build PressureMapOpts from input; omit keys when undefined. */
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

  const o: Partial<PressureMapOpts> = {};
  if (gamma !== undefined) o.gamma = gamma;
  if (deadZone !== undefined) o.deadZone = deadZone;

  return Object.keys(o).length ? (o as PressureMapOpts) : undefined;
}

/** Chunky splat bursts interleaved with normal dots. */
export function drawSpraySplatter(ctx: Ctx2D, opt: RenderOptions): void {
  const path = opt.path ?? [];
  const viewW = Math.max(1, Math.floor(opt.width));
  const viewH = Math.max(1, Math.floor(opt.height));
  if (path.length < 2) return;

  const ov = (opt.engine.overrides ?? {}) as Partial<RenderOverrides>;
  const flow01 = clamp01(((ov.flow ?? 100) as number) / 100);
  const opacity01 = clamp01(((ov.opacity ?? 100) as number) / 100);

  // Local overrides for splatter behavior
  const local =
    (opt.engine.backendOverrides?.spray as SplatterOverrides | undefined) ?? {};
  const burstEvery = Math.max(6, Math.round(local.burstEvery ?? 10));
  const burstCount = Math.max(1, Math.round(local.burstCount ?? 6));
  const burstSizeMul = Math.max(1.2, local.burstSizeMul ?? 1.8);

  // Spacing / jitter / scatter from engine strokePath
  const spacingPercent = (opt.engine.strokePath?.spacing ??
    (ov.spacing as number | undefined) ??
    6) as number;
  const jitterPercent =
    ((opt.engine.strokePath?.jitter ??
      (ov.jitter as number | undefined) ??
      0.5) as number) * 100;
  const scatterPx = (opt.engine.strokePath?.scatter ??
    (ov.scatter as number | undefined) ??
    0) as number;

  const seed = (opt.seed ?? 999) >>> 0;
  const rng = Rand.mulberry32(seed);
  const rand = (): number => rng.nextFloat();

  // Optional pressure mapping + inputQuality (omit when empty)
  const pmap = toPressureMapFromInput(opt);
  const iq = {
    ...(opt.input?.quality?.predictPx !== undefined
      ? { predictPx: opt.input.quality.predictPx }
      : {}),
    ...(opt.input?.quality?.speedToSpacing !== undefined
      ? { speedToSpacing: opt.input.quality.speedToSpacing }
      : {}),
    ...(opt.input?.quality?.minStepPx !== undefined
      ? { minStepPx: opt.input.quality.minStepPx }
      : {}),
  } as const;
  const includeIQ = Object.keys(iq).length > 0;

  const baseOpts = {
    baseSizePx: opt.baseSizePx,
    spacingPercent,
    jitterPercent,
    scatterPx,
    stampsPerStep: 1,
    streamline: opt.engine.strokePath?.streamline ?? 0,
    angleFollowDirection: 0,
    angleJitterDeg: 0,
    tipMinPx: 0,
    tipScaleStart: 0.85,
    tipScaleEnd: 0.85,
    taperProfileStart: "linear" as const,
    taperProfileEnd: "linear" as const,
    endBias: 0,
    uniformity: 0,
    rng,
  };

  const stamps = pathToStamps(path, {
    ...baseOpts,
    ...(pmap ? { pressureMap: pmap } : {}),
    ...(includeIQ ? { inputQuality: iq } : {}),
  });
  if (!stamps.length) return;

  const color = opt.color ?? "#000000";
  const baseR = Math.max(0.25, (opt.baseSizePx || 6) * 0.38);
  const alphaMin = clamp01(local.alphaMin ?? 0);
  const alphaMax = clamp01(local.alphaMax ?? 1);

  // Estimate step size for scatter baseline
  const stepPx = Math.max(
    0.6,
    (spacingPercent > 1 ? spacingPercent / 100 : spacingPercent) *
      (opt.baseSizePx || 6)
  );

  const { mask, mx } = newMask(viewW, viewH);
  const { colorLayer, cx } = newColorLayer(viewW, viewH);

  for (let i = 0; i < stamps.length; i++) {
    const s = stamps[i]!; // we already checked length; assert defined

    // Normal dots (few per stamp)
    const dots = 2 + Math.floor(3 * s.pressure);
    for (let k = 0; k < dots; k++) {
      const rr = Math.pow(rand(), 1.35);
      const ang = rand() * Math.PI * 2;
      const rScatter = rr * (scatterPx + stepPx * 0.7);
      const px = s.x + Math.cos(ang) * rScatter;
      const py = s.y + Math.sin(ang) * rScatter;

      const radius = gaussianRadius(baseR * (0.7 + 0.6 * s.pressure), rand);
      const alpha = Math.max(
        alphaMin,
        Math.min(alphaMax, flow01 * (0.6 + 0.6 * s.pressure))
      );
      paintDot(mx, px, py, radius, "#000", 1);
      paintDot(cx, px, py, radius, color, alpha);
    }

    // Burst?
    if (i % burstEvery === 0) {
      for (let b = 0; b < burstCount; b++) {
        const ang = rand() * Math.PI * 2;
        const d = (stepPx + scatterPx) * (0.8 + rand() * 1.2);
        const px = s.x + Math.cos(ang) * d;
        const py = s.y + Math.sin(ang) * d;

        const radius = gaussianRadius(
          baseR * burstSizeMul * (0.85 + 0.5 * s.pressure),
          rand
        );
        const alpha = Math.max(
          alphaMin,
          Math.min(alphaMax, flow01 * (0.5 + 0.7 * s.pressure))
        );
        paintDot(mx, px, py, radius, "#000", 1);
        paintDot(cx, px, py, radius, color, alpha);
      }
    }
  }

  // Keep color only where mask exists
  clipColorByMask(cx, mask);

  // Final composite
  Blend.withCompositeAndAlpha(ctx, "source-over", opacity01, () => {
    ctx.drawImage(colorLayer, 0, 0);
  });
}
