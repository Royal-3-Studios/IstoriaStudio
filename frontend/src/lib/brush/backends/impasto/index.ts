// FILE: src/lib/brush/backends/impasto/index.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import { drawImpastoBristle } from "./variants/bristle";
import { drawImpastoKnife } from "./variants/knife";
import { drawImpastoGlaze } from "./variants/glaze";
import { drawImpastoRake } from "./variants/rake";
import { type Ctx2D, type CanvasLike, get2D } from "@backends/utils/canvas";

// Normalize tilt routing (tilt→size/fan/grainScale/edgeNoise) once per backend.
import { getTiltOverrides } from "@backends/stamping/utils/scalars";

export type ImpastoMode = "bristle" | "knife" | "glaze" | "rake";

export function pickImpastoMode(opt: RenderOptions): ImpastoMode {
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
  // Merge normalized tilt knobs into overrides so variants can just read them.
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

  switch (pickImpastoMode(optWithTilt)) {
    case "knife":
      drawImpastoKnife(ctx, optWithTilt);
      break;
    case "glaze":
      drawImpastoGlaze(ctx, optWithTilt);
      break;
    case "rake":
      drawImpastoRake(ctx, optWithTilt);
      break;
    case "bristle":
    default:
      drawImpastoBristle(ctx, optWithTilt);
      break;
  }
}

/** Convenience: accept a canvas and get a 2D context for you. */
export function drawToCanvas(canvas: CanvasLike, opt: RenderOptions): void {
  const ctx = get2D(canvas);
  drawImpasto(ctx, opt);
}
