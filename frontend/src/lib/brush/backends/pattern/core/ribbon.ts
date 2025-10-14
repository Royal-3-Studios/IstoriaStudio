// FILE: src/lib/brush/backends/pattern/core/ribbon.ts
import type { RenderOptions, RenderPathPoint } from "@/lib/brush/engine.types";
import {
  // canonical stroke helpers & types
  resampleWithAngle as strokeResampleWithAngle,
  buildRibbonOutline as strokeBuildRibbonOutline,
  resolveSpacingFraction,
  type SampleWithAngle,
} from "@backends/utils/stroke";

/** Thin wrapper to keep pattern/core isolated while reusing canonical logic. */
export function resampleWithAngle(
  pts: ReadonlyArray<RenderPathPoint>,
  stepPx: number
): SampleWithAngle[] {
  return strokeResampleWithAngle(pts, stepPx);
}

/** Build a closed Path2D ribbon outline (delegates to canonical impl). */
export function buildRibbonOutline(
  samples: ReadonlyArray<SampleWithAngle>,
  radiusAt: (u: number) => number
): Path2D {
  return strokeBuildRibbonOutline(samples, radiusAt);
}

/** Map UI spacing (percent/fraction) to a clamped pixel step for resampling. */
export function spacingToStepPx(opt: RenderOptions): number {
  const ui =
    (typeof opt.engine.strokePath?.spacing === "number"
      ? opt.engine.strokePath.spacing
      : undefined) ??
    (typeof opt.engine.overrides?.spacing === "number"
      ? opt.engine.overrides.spacing
      : undefined) ??
    6;

  const frac = resolveSpacingFraction(ui as number, 6);
  const baseR = Math.max(0.5, (opt.baseSizePx ?? 8) * 0.5);
  return Math.max(0.45, Math.min(2.2, baseR * frac));
}
