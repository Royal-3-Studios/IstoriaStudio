// FILE: src/lib/brush/backends/pattern/index.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import { get2D, type Ctx2D, type CanvasLike } from "@backends/utils/canvas";

import { drawPatternStroke } from "./variants/stroke";
import { drawPatternFill } from "./variants/fill";
import { drawPatternScatter } from "./variants/scatter";

// Normalize tilt routing once per backend (tilt→size/fan/grainScale/edgeNoise)
import { getTiltOverrides } from "@backends/stamping/utils/scalars";

export type PatternVariant = "stroke" | "fill" | "scatter";

const VARIANTS: Record<
  PatternVariant,
  (ctx: Ctx2D, opt: RenderOptions) => void
> = {
  stroke: drawPatternStroke,
  fill: drawPatternFill,
  scatter: drawPatternScatter,
};

function isPatternVariant(x: unknown): x is PatternVariant {
  return x === "stroke" || x === "fill" || x === "scatter";
}

/** Preferred: read mode from engine.backendOverrides.pattern.mode */
export function pickVariant(opt: RenderOptions): PatternVariant {
  const local = opt.engine.backendOverrides?.pattern as
    | { mode?: unknown }
    | undefined;
  const m = local?.mode;
  return isPatternVariant(m) ? m : "stroke";
}

/**
 * Core entry. Priority:
 *  1) explicit `variant` arg
 *  2) engine.backendOverrides.pattern.mode
 *  3) "stroke" fallback
 *
 * We also merge normalized tilt knobs into overrides once, so variants
 * can just read ov.tiltTo* without re-deriving.
 */
export default function renderPattern(
  ctx: Ctx2D,
  opt: RenderOptions,
  variant?: PatternVariant
): void {
  const tilt = getTiltOverrides(opt.engine.overrides);
  const optWithTilt: RenderOptions = {
    ...opt,
    engine: {
      ...opt.engine,
      overrides: {
        ...(opt.engine.overrides ?? {}),
        ...tilt,
      },
    },
  };

  const key = variant ?? pickVariant(optWithTilt);
  (VARIANTS[key] ?? drawPatternStroke)(ctx, optWithTilt);
}

/** Convenience: accept a canvas surface, fetch 2D, then draw. */
export function drawToCanvas(
  canvas: CanvasLike,
  opt: RenderOptions,
  variant?: PatternVariant
): void {
  const ctx = get2D(canvas);
  renderPattern(ctx, opt, variant);
}

// Re-exports for direct access if you use them elsewhere
export { drawPatternStroke } from "./variants/stroke";
export { drawPatternFill } from "./variants/fill";
export { drawPatternScatter } from "./variants/scatter";
