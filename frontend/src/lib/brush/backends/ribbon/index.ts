// FILE: src/lib/brush/backends/ribbon/index.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import { type Ctx2D, type CanvasLike, get2D } from "@backends/utils/canvas";

import { drawRibbonPencil } from "./variants/pencil";
import { drawRibbonInk } from "./variants/ink";
import { drawRibbonCalligraphy } from "./variants/calligraphy";
import { drawRibbonMarker } from "./variants/marker";

// Normalize tilt routing (tilt→size/fan/grainScale/edgeNoise) once per backend
import { getTiltOverrides } from "@backends/stamping/utils/scalars";

/** All supported ribbon rendering modes. */
export type RibbonMode = "pencil" | "ink" | "calligraphy" | "marker";

/** Backend-local config attachable at engine.backendOverrides.ribbon */
export type RibbonBackendConfig = Partial<{
  mode: RibbonMode;
  nibAngleDeg: number; // used by calligraphy variant
  tipMinPx: number; // shared minimum tip width
}>;

function getRibbonConfig(opt: RenderOptions): RibbonBackendConfig | undefined {
  const bo = opt.engine.backendOverrides as
    | { ribbon?: RibbonBackendConfig }
    | undefined;
  return bo?.ribbon;
}

/** Resolve concrete mode (default "pencil"). */
export function pickMode(opt: RenderOptions): RibbonMode {
  const m = getRibbonConfig(opt)?.mode;
  return m === "ink" || m === "calligraphy" || m === "marker" ? m : "pencil";
}

/** Core entry: draw using the selected variant. */
export default function drawRibbon(ctx: Ctx2D, opt: RenderOptions): void {
  // Merge normalized tilt knobs into overrides once, so variants can just read ov.tiltTo*
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

  switch (pickMode(optWithTilt)) {
    case "ink":
      drawRibbonInk(ctx, optWithTilt);
      break;
    case "calligraphy":
      drawRibbonCalligraphy(ctx, optWithTilt);
      break;
    case "marker":
      drawRibbonMarker(ctx, optWithTilt);
      break;
    case "pencil":
    default:
      drawRibbonPencil(ctx, optWithTilt);
      break;
  }
}

/** Standard convenience: accept a canvas surface, fetch 2D, then draw. */
export function drawToCanvas(surface: CanvasLike, opt: RenderOptions): void {
  const ctx = get2D(surface);
  drawRibbon(ctx, opt);
}
