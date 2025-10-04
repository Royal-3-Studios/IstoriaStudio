// FILE: src/lib/brush/backends/stamping/core/resample.ts
import type { RenderOptions } from "@/lib/brush/engine";
import {
  resamplePath,
  resolveSpacingFraction,
  type SamplePoint,
} from "@/lib/brush/backends/utils/stroke";

/** Convert engine spacing → pixel step (CSS px). */
export function spacingToStepPx(
  opt: RenderOptions,
  baseRadiusPx: number
): number {
  const uiSpacing =
    opt.engine.strokePath?.spacing ??
    (opt.engine.overrides?.spacing as number | undefined) ??
    6;
  const frac = resolveSpacingFraction(uiSpacing, 6);
  const step = Math.max(0.45, Math.min(4.0, 2 * baseRadiusPx * frac));
  return step;
}

/** Even resample with pressure preserved. */
export function resampleWithAngle(
  points: ReadonlyArray<{ x: number; y: number; pressure?: number }>,
  stepPx: number
): SamplePoint[] {
  return resamplePath(points, stepPx); // strictly typed upstream; SamplePoint matches
}

export type { SamplePoint } from "@/lib/brush/backends/utils/stroke";
