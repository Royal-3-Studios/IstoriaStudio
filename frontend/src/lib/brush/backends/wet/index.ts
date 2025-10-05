// FILE: src/lib/brush/backends/wet/index.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import { type Ctx2D, type CanvasLike, get2D } from "@backends/utils/canvas";

import { drawWetWash } from "./variants/wash";
import { drawWetGlaze } from "./variants/glaze";
import { drawWetEdge } from "./variants/edge";
import { drawWetBloom } from "./variants/bloom";
import { drawWetLift } from "./variants/lift";

export type WetMode = "wash" | "glaze" | "edge" | "bloom" | "lift";

function isWetMode(x: unknown): x is WetMode {
  return (
    x === "wash" ||
    x === "glaze" ||
    x === "edge" ||
    x === "bloom" ||
    x === "lift"
  );
}

function pickWetMode(opt: RenderOptions): WetMode {
  const m = (opt.engine.backendOverrides?.wet as { mode?: unknown } | undefined)
    ?.mode;
  return isWetMode(m) ? m : "wash";
}

/** Core entry: draw using the selected wet variant. */
export default function draw(ctx: Ctx2D, opt: RenderOptions): void {
  switch (pickWetMode(opt)) {
    case "glaze":
      drawWetGlaze(ctx, opt);
      break;
    case "edge":
      drawWetEdge(ctx, opt);
      break;
    case "bloom":
      drawWetBloom(ctx, opt);
      break;
    case "lift":
      drawWetLift(ctx, opt);
      break;
    case "wash":
    default:
      drawWetWash(ctx, opt);
      break;
  }
}

/** Standard convenience: accept a canvas surface, fetch 2D, then draw. */
export function drawToCanvas(surface: CanvasLike, opt: RenderOptions): void {
  const ctx = get2D(surface);
  draw(ctx, opt);
}
