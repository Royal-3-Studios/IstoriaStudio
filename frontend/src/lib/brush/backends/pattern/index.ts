// FILE: src/lib/brush/backends/pattern/index.ts
import type { RenderOptions } from "@/lib/brush/engine";
import { get2D, type Ctx2D } from "@backends/utils/canvas";

import { drawPatternStroke } from "./variants/stroke";
// If you have these, keep; otherwise comment them out.
import { drawPatternFill } from "./variants/fill";
import { drawPatternScatter } from "./variants/scatter";

export type PatternVariant = "stroke" | "fill" | "scatter";

const VARIANTS: Record<
  PatternVariant,
  (ctx: Ctx2D, opt: RenderOptions) => void
> = {
  stroke: drawPatternStroke,
  fill: drawPatternFill,
  scatter: drawPatternScatter,
};

/** Safely read a string `variant` off an unknown object (no `any`). */
function readVariant(o: unknown): string | undefined {
  if (o && typeof o === "object") {
    const v = (o as Record<string, unknown>).variant;
    return typeof v === "string" ? v : undefined;
  }
  return undefined;
}

/**
 * Render entry for the pattern backend.
 * If `variant` is not provided, it tries `opt.engine.variant`, else defaults to "stroke".
 */
export default function renderPattern(
  ctx: Ctx2D,
  opt: RenderOptions,
  variant?: PatternVariant
): void {
  const hint = readVariant(opt.engine) as PatternVariant | undefined;
  const key: PatternVariant = variant ?? hint ?? "stroke";
  (VARIANTS[key] ?? drawPatternStroke)(ctx, opt);
}

/** Convenience: accept a canvas surface, fetch a 2D context, then draw. */
export function drawToCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
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
