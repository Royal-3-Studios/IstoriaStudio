// FILE: src/lib/brush/backends/pattern/index.ts

import type { RenderOptions } from "@/lib/brush/engine";
import { type Ctx2D, get2D } from "./utils/canvas";

import { drawPatternStroke } from "./variants/stroke";
import { drawPatternFill } from "./variants/fill";
import { drawPatternScatter } from "./variants/scatter";

/** Which *rendering style* to use. */
export type PatternMode = "stroke" | "fill" | "scatter";

/** Optional overrides passed via engine.overrides.* or backendOverrides.pattern */
export type PatternOverrides = Partial<{
  mode: PatternMode;
  patternKind: "paper" | "canvas" | "noise" | "checker";
  patternScale: number;
  patternRotateDeg: number;
  patternAlpha: number;
  patternContrast: number;
  patternTipFade: number;
  patternComposite: GlobalCompositeOperation;
  patternHatchThickness: number;
}>;

function pickMode(opt: RenderOptions): PatternMode {
  const local = opt.engine.backendOverrides?.pattern as
    | PatternOverrides
    | undefined;
  const m = local?.mode; // (don’t read non-existent opt.engine.overrides.patternMode)
  return m === "fill" || m === "scatter" ? m : "stroke";
}

/** Draw into an existing 2D context (engine has already sized/DPR’d the layer). */
export default function drawPattern(ctx: Ctx2D, opt: RenderOptions): void {
  const mode = pickMode(opt);
  switch (mode) {
    case "fill":
      drawPatternFill(ctx, opt);
      break;
    case "scatter":
      drawPatternScatter(ctx, opt);
      break;
    default:
      drawPatternStroke(ctx, opt);
      break;
  }
}

/** Convenience wrapper: accept a canvas surface, fetch 2D, then draw. */
export async function drawPatternToCanvas(
  surface: HTMLCanvasElement | OffscreenCanvas,
  opt: RenderOptions
): Promise<void> {
  const ctx = get2D(surface);
  drawPattern(ctx, opt);
}
