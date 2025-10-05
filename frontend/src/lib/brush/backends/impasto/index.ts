// FILE: src/lib/brush/backends/impasto/index.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import { drawImpastoBristle } from "./variants/bristle";
import { drawImpastoKnife } from "./variants/knife";
import { drawImpastoGlaze } from "./variants/glaze";
import { drawImpastoRake } from "./variants/rake";

import { type Ctx2D, type CanvasLike, get2D } from "@backends/utils/canvas";

export type ImpastoMode = "bristle" | "knife" | "glaze" | "rake";

function pickImpastoMode(opt: RenderOptions): ImpastoMode {
  const m = opt.engine.backendOverrides?.impasto as
    | { mode?: unknown }
    | undefined;
  const mode = m?.mode;
  return mode === "knife" || mode === "glaze" || mode === "rake"
    ? mode
    : "bristle";
}

/** Core entry: draw using the selected impasto variant. */
export default function drawImpasto(ctx: Ctx2D, opt: RenderOptions): void {
  switch (pickImpastoMode(opt)) {
    case "knife":
      drawImpastoKnife(ctx, opt);
      break;
    case "glaze":
      drawImpastoGlaze(ctx, opt);
      break;
    case "rake":
      drawImpastoRake(ctx, opt);
      break;
    case "bristle":
    default:
      drawImpastoBristle(ctx, opt);
      break;
  }
}

/** Convenience: accept a canvas and get a 2D context for you. */
export function drawToCanvas(canvas: CanvasLike, opt: RenderOptions): void {
  const ctx = get2D(canvas);
  drawImpasto(ctx, opt);
}
