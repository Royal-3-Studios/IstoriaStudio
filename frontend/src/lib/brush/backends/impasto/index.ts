// FILE: src/lib/brush/backends/impasto/index.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import { drawImpastoBristle } from "./variants/bristle";
import { drawImpastoKnife } from "./variants/knife";
import { drawImpastoGlaze } from "./variants/glaze";
import { drawImpastoRake } from "./variants/rake";

import type { Ctx2D, CanvasLike } from "@/lib/canvas/context";
import { get2DContext } from "@/lib/canvas/context";

export type ImpastoMode = "bristle" | "knife" | "glaze" | "rake";

function pickImpastoMode(opt: RenderOptions): ImpastoMode {
  const m = opt.engine.backendOverrides?.impasto as
    | { mode?: unknown }
    | undefined;
  const mode = m?.mode;
  if (mode === "knife" || mode === "glaze" || mode === "rake") return mode;
  return "bristle";
}

export default function drawImpasto(ctx: Ctx2D, opt: RenderOptions): void {
  const mode = pickImpastoMode(opt);
  switch (mode) {
    case "knife":
      drawImpastoKnife(ctx, opt);
      break;
    case "glaze":
      drawImpastoGlaze(ctx, opt);
      break;
    case "rake":
      drawImpastoRake(ctx, opt);
      break;
    default:
      drawImpastoBristle(ctx, opt);
      break;
  }
}

/** Convenience: accept a canvas and grab a 2D context for you. */
export function drawImpastoToCanvas(
  canvas: CanvasLike,
  opt: RenderOptions
): void {
  const ctx = get2DContext(canvas);
  drawImpasto(ctx, opt);
}
