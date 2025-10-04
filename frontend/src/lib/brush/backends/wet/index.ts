import type { RenderOptions } from "@/lib/brush/engine.types";
import type { Ctx2D, CanvasLike } from "@/lib/canvas/context";
import { get2DContext } from "@/lib/canvas/context";

import { drawWetWash } from "./variants/wash";
import { drawWetGlaze } from "./variants/glaze";
import { drawWetEdge } from "./variants/edge";
import { drawWetBloom } from "./variants/bloom";
import { drawWetLift } from "./variants/lift";

export type WetMode = "wash" | "glaze" | "edge" | "bloom" | "lift";

function pickWetMode(opt: RenderOptions): WetMode {
  const m = (opt.engine.backendOverrides?.wet as { mode?: unknown } | undefined)
    ?.mode;
  if (m === "glaze" || m === "edge" || m === "bloom" || m === "lift") return m;
  return "wash";
}

export default function drawWet(ctx: Ctx2D, opt: RenderOptions): void {
  switch (pickWetMode(opt)) {
    case "glaze":
      return void drawWetGlaze(ctx, opt);
    case "edge":
      return void drawWetEdge(ctx, opt);
    case "bloom":
      return void drawWetBloom(ctx, opt);
    case "lift":
      return void drawWetLift(ctx, opt);
    default:
      return void drawWetWash(ctx, opt);
  }
}

export async function drawWetToCanvas(
  canvas: CanvasLike,
  opt: RenderOptions
): Promise<void> {
  const ctx = get2DContext(canvas);
  if (!ctx) throw new Error("2D context not available.");
  drawWet(ctx, opt);
}
