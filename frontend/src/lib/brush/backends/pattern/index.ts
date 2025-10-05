// FILE: src/lib/brush/backends/pattern/index.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import {
  type Ctx2D,
  type CanvasLike,
  get2D,
} from "@/lib/brush/backends/utils/canvas";

import { drawPatternStroke } from "./variants/stroke";
import { drawPatternFill } from "./variants/fill";
import { drawPatternScatter } from "./variants/scatter";

/** Which *rendering style* to use. */
export type PatternMode = "stroke" | "fill" | "scatter";

/** Optional overrides passed via engine.backendOverrides.pattern */
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
  const m = local?.mode;
  return m === "fill" || m === "scatter" ? m : "stroke";
}

/** Core entry: draw using the selected variant. */
export default function drawPattern(ctx: Ctx2D, opt: RenderOptions): void {
  switch (pickMode(opt)) {
    case "fill":
      drawPatternFill(ctx, opt);
      break;
    case "scatter":
      drawPatternScatter(ctx, opt);
      break;
    case "stroke":
    default:
      drawPatternStroke(ctx, opt);
      break;
  }
}

/** Convenience: accept a canvas surface, fetch 2D, then draw. */
export function drawToCanvas(surface: CanvasLike, opt: RenderOptions): void {
  const ctx = get2D(surface);
  drawPattern(ctx, opt);
}
