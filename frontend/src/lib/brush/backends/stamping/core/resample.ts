// FILE: src/lib/brush/backends/stamping/core/resample.ts
import type { RenderOptions, RenderPathPoint } from "@/lib/brush/engine.types";
import {
  resamplePath,
  resolveSpacingFraction,
  type SamplePoint,
} from "@backends/utils/stroke";

/* =============================================================================
 * Spacing: UI → pixels
 * ============================================================================= */

/** Convert engine spacing → pixel step (CSS px). */
export function spacingToStepPx(
  opt: RenderOptions,
  baseRadiusPx: number
): number {
  const uiSpacing =
    opt.engine.strokePath?.spacing ??
    (opt.engine.overrides?.spacing as number | undefined) ??
    6;

  // resolve UI spacing (% or fraction) to a safe fraction of diameter
  const frac = resolveSpacingFraction(uiSpacing, 6);

  // step is based on diameter (2 * radius) with sensible clamps
  const step = Math.max(0.45, Math.min(4.0, 2 * baseRadiusPx * frac));
  return step;
}

/* =============================================================================
 * Resampling (even spacing; carries pressure; NO angle in result)
 * ============================================================================= */

// Overloads for clarity: we accept either RenderPathPoint[] or lightweight points.
export function resampleEven(
  points: ReadonlyArray<RenderPathPoint>,
  stepPx: number
): SamplePoint[];
export function resampleEven(
  points: ReadonlyArray<{
    x: number;
    y: number;
    pressure?: number;
    p?: number;
    angle?: number;
    t?: number;
  }>,
  stepPx: number
): SamplePoint[];

// Single implementation (exactOptionalPropertyTypes-safe)
export function resampleEven(
  points:
    | ReadonlyArray<RenderPathPoint>
    | ReadonlyArray<{
        x: number;
        y: number;
        pressure?: number;
        p?: number;
        angle?: number;
        t?: number;
      }>,
  stepPx: number
): SamplePoint[] {
  if (!points || points.length === 0) return [];

  // Coerce to RenderPathPoint for the shared resampler.
  // Only include optional fields when present.
  const src: RenderPathPoint[] = (points as ReadonlyArray<any>).map((pt) => {
    const pressure =
      typeof pt.p === "number"
        ? pt.p
        : typeof pt.pressure === "number"
          ? pt.pressure
          : 1;

    const base: RenderPathPoint = { x: pt.x, y: pt.y, pressure };

    return typeof pt.angle === "number" || typeof pt.t === "number"
      ? {
          ...base,
          ...(typeof pt.angle === "number" ? { angle: pt.angle } : {}),
          ...(typeof pt.t === "number" ? { t: pt.t } : {}),
        }
      : base;
  });

  return resamplePath(src, stepPx);
}

/** Back-compat alias: old name suggested angle but returns SamplePoint[] (no angle). */
export const resampleWithAngle = resampleEven;

// Re-export for convenience
export type { SamplePoint } from "@backends/utils/stroke";
