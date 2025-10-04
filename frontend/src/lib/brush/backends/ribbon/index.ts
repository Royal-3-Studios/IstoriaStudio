// FILE: src/lib/brush/backends/ribbon/index.ts
import type { RenderOptions } from "@/lib/brush/engine";
import type { Ctx2D, CanvasLike } from "./utils/canvas";

import { drawRibbonPencil } from "./variants/pencil";
import { drawRibbonInk } from "./variants/ink";
import { drawRibbonCalligraphy } from "./variants/calligraphy";
import { drawRibbonMarker } from "./variants/marker";

/** All supported ribbon rendering modes. */
export type RibbonMode = "pencil" | "ink" | "calligraphy" | "marker";

/** Backend-local config attachable at engine.backendOverrides.ribbon */
export type RibbonBackendConfig = {
  mode?: RibbonMode;
  nibAngleDeg?: number; // used by calligraphy (if you read it there)
  tipMinPx?: number; // shared min tip width (if you read it there)
};

type EngineBackendOverridesWithRibbon = {
  ribbon?: RibbonBackendConfig;
};

function getRibbonConfig(opt: RenderOptions): RibbonBackendConfig | undefined {
  const bo = opt.engine.backendOverrides as
    | EngineBackendOverridesWithRibbon
    | undefined;
  return bo?.ribbon;
}

function pickMode(opt: RenderOptions): RibbonMode {
  const m = getRibbonConfig(opt)?.mode;
  return m === "ink" || m === "calligraphy" || m === "marker" ? m : "pencil";
}

/** Core entry: draw using the selected variant. */
export default function drawRibbon(ctx: Ctx2D, opt: RenderOptions): void {
  switch (pickMode(opt)) {
    case "ink":
      drawRibbonInk(ctx, opt);
      break;
    case "calligraphy":
      drawRibbonCalligraphy(ctx, opt);
      break;
    case "marker":
      drawRibbonMarker(ctx, opt);
      break;
    default:
      drawRibbonPencil(ctx, opt);
      break;
  }
}

/**
 * Convenience wrapper for adapters: accept a CanvasLike, get a 2D context,
 * and call the core draw function. (Draw only in CSS space; engine sets DPR.)
 */
export async function drawRibbonToCanvas(
  canvas: CanvasLike,
  opt: RenderOptions
): Promise<void> {
  const ctx = canvas.getContext("2d", { alpha: true }) as Ctx2D | null;
  if (!ctx) return;
  drawRibbon(ctx, opt);
}
