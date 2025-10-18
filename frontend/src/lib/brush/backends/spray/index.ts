// FILE: src/lib/brush/backends/spray/index.ts

import type { RenderOptions } from "@/lib/brush/engine.types";
import { type Ctx2D, type CanvasLike, get2D } from "@backends/utils/canvas";
import { getTiltOverrides } from "@backends/stamping/utils/scalars";

import { drawSprayToCanvas } from "./core/spray";
import type { SprayOptions } from "./types";

/* -------------------------------------------------------------------------- */
/*                                  MODES                                     */
/* -------------------------------------------------------------------------- */

export type SprayMode = "airbrush"; // future: "splatter" | "nozzle" | "stipple"

export type SprayBackendConfig = Partial<{
  mode: SprayMode;
}>;

function getSprayConfig(opt: RenderOptions): SprayBackendConfig | undefined {
  const bo = (opt as any)?.engine?.backendOverrides as
    | { spray?: SprayBackendConfig }
    | undefined;
  return bo?.spray;
}

/** Default to “airbrush” mode for now. */
export function pickMode(opt: RenderOptions): SprayMode {
  const m = getSprayConfig(opt)?.mode;
  return m === "airbrush" ? m : "airbrush";
}

/* -------------------------------------------------------------------------- */
/*                              DEFAULTS + MERGE                              */
/* -------------------------------------------------------------------------- */

function defaults(): SprayOptions {
  return {
    sigmaPx: 12,
    hardness: 10,
    flow: 100,
    hoverRateAlphaPerSec: 1.0,
    moveRateAlphaPerPx: 0.04,
    minStepMs: 8,
    noiseAmount: 0,
    noiseScalePx: 64,
    spriteResolution: 256,
  };
}

/** Merge caller’s options with defaults (exactOptionalPropertyTypes-safe). */
function normalizeOptions(
  opt: RenderOptions & Partial<{ spray: Partial<SprayOptions> }>
): RenderOptions & { spray: SprayOptions } {
  const merged = { ...defaults(), ...(opt.spray ?? {}) };
  return { ...(opt as RenderOptions), spray: merged };
}

/* -------------------------------------------------------------------------- */
/*                               CORE WRAPPERS                                */
/* -------------------------------------------------------------------------- */

/**
 * Draw spray onto an existing 2D context (DOM or Offscreen).
 * We pass ctx.canvas as the CanvasLike surface to the core renderer.
 */
export function drawSpray(ctx: Ctx2D, opt: RenderOptions): void {
  const tilt = getTiltOverrides((opt as any)?.engine?.overrides);
  const optWithTilt: RenderOptions = {
    ...opt,
    engine: {
      ...(opt as any).engine,
      overrides: {
        ...((opt as any)?.engine?.overrides ?? {}),
        ...tilt,
      },
    },
  };

  const nopt = normalizeOptions(optWithTilt);
  const path = (nopt as any)?.path;
  if (!path) throw new Error("spray/index: missing path on RenderOptions");

  // ctx.canvas is HTMLCanvasElement | OffscreenCanvas, which matches CanvasLike
  drawSprayToCanvas(ctx.canvas as CanvasLike, path, nopt);
}

/**
 * Convenience entry: accept a canvas surface, get a context, and draw.
 * We still route to the core via the surface so both DOM and Offscreen work.
 */
export function drawToCanvas(surface: CanvasLike, opt: RenderOptions): void {
  // Validate/initialize the context (keeps parity with other backends)
  const ctx = get2D(surface);
  drawSpray(ctx, opt);
}

export default drawToCanvas;
