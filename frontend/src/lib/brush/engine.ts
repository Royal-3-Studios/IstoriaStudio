// FILE: src/lib/brush/engine.ts
/**
 * Brush Engine Orchestrator
 * ------------------------------------------------------------
 * - Normalize opts, size to pixelRatio
 * - Pick backend via registry
 * - Render into an offscreen layer
 * - Composite with global blend/opacity
 */
import { getAdapterForBackend } from "@/lib/brush/backends/registry";
import {
  createLayer,
  type Ctx2D,
  type CanvasLike,
} from "@backends/utils/canvas";
import { ensureCanvasDprSize } from "./backends/utils/offscreen";
import { createBrushContext } from "@/lib/brush/core/brushContext";
import { mulberry32 } from "./backends/utils/random";
import {
  withCompositeAndAlpha,
  toCompositeOp,
} from "./backends/utils/blending";

import type { NormalizedRenderOptions, RenderOptions } from "./engine.types";
import type { BrushContextInit } from "@/lib/brush/core/brushContext";

import {
  normalizeOptions,
  chooseBackend,
  isCanvas2DContext,
} from "./engine.utils";

/* ------------------------------ helpers ------------------------------ */

function awaitMaybe<T>(v: T | Promise<T>): Promise<T> {
  return Promise.resolve(v);
}

/* ------------------------------ core draw ---------------------------- */

async function drawStrokeToAny(
  surface: CanvasLike,
  opt: RenderOptions
): Promise<void> {
  const nopt = normalizeOptions(opt);
  const dpr = nopt.pixelRatio;

  // Build BrushContextInit without assigning undefined fields
  const initCtx: BrushContextInit = {
    width: nopt.width,
    height: nopt.height,
    dpr,
    seed: nopt.seed ?? 1,
    colorHex: nopt.color,
    rngFactory: (s) => mulberry32(s),
  };

  // Optional engine overrides
  if (nopt.engine.overrides.speedSmoothingMs !== undefined) {
    initCtx.speedSmoothingMs = nopt.engine.overrides.speedSmoothingMs;
  }

  // Smudge defaults (attach only if something provided)
  const sd: NonNullable<BrushContextInit["smudgeDefaults"]> = {};
  const { smudgeStrength, smudgeAlpha, smudgeBlur, smudgeSpacing } =
    nopt.engine.overrides;
  if (smudgeStrength !== undefined) sd.strength = smudgeStrength;
  if (smudgeAlpha !== undefined) sd.alphaMul = smudgeAlpha;
  if (smudgeBlur !== undefined) sd.blurPx = smudgeBlur;
  if (smudgeSpacing !== undefined) sd.spacingOverride = smudgeSpacing;
  if (Object.keys(sd).length > 0) initCtx.smudgeDefaults = sd;

  const brushCtx = createBrushContext(initCtx);
  const optWithCtx: NormalizedRenderOptions & { brushCtx: typeof brushCtx } = {
    ...nopt,
    brushCtx,
  };

  // Size the destination surface (device pixels) and prep its 2D ctx in CSS space
  ensureCanvasDprSize(surface, nopt.width, nopt.height, dpr);
  const ctx = surface.getContext?.("2d", { alpha: true }) as Ctx2D | null;
  if (!isCanvas2DContext(ctx)) throw new Error("2D context unavailable");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, nopt.width, nopt.height);

  // Offscreen layer we render into, then composite back
  const layer = createLayer(
    Math.max(1, Math.floor(nopt.width * dpr)),
    Math.max(1, Math.floor(nopt.height * dpr))
  );
  const lctx = (layer as CanvasLike).getContext?.("2d", {
    alpha: true,
  }) as Ctx2D | null;
  if (!isCanvas2DContext(lctx)) throw new Error("2D layer context unavailable");
  lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  lctx.clearRect(0, 0, nopt.width, nopt.height);

  // Dispatch via registry
  const backend = chooseBackend(nopt);
  const adapter = getAdapterForBackend(backend);
  await awaitMaybe(adapter.drawToCanvas(layer, optWithCtx));

  // Composite with global blend + opacity
  const blend = nopt.engine.rendering.blendMode ?? "source-over";
  const opacity01 = Math.max(
    0,
    Math.min(1, (nopt.engine.overrides.opacity ?? 100) / 100)
  );

  withCompositeAndAlpha(ctx, toCompositeOp(blend), opacity01, () => {
    ctx.drawImage(
      layer as unknown as CanvasImageSource,
      0,
      0,
      nopt.width,
      nopt.height
    );
  });
}

/* ------------------------------ public API --------------------------- */

export async function drawStrokeToCanvas(
  targetCanvas: HTMLCanvasElement | OffscreenCanvas,
  normalized: NormalizedRenderOptions
): Promise<void> {
  // Reuse the same pipeline; normalized is already in final form
  await drawStrokeToAny(targetCanvas, normalized);
}

export async function drawStrokeToSurface(
  surface: CanvasLike,
  opt: RenderOptions
): Promise<void> {
  return drawStrokeToAny(surface, opt);
}

export const renderBrushPreview = drawStrokeToCanvas;
export default drawStrokeToCanvas;

/* ------------------------------ re-exports --------------------------- */
export type {
  BrushBackend,
  RenderingMode,
  EngineShape,
  EngineStrokePath,
  EngineGrain,
  EngineRendering,
  EngineConfig,
  RenderOverrides,
  RenderPathPoint,
  RenderOptions,
  NormalizedRenderOptions,
} from "./engine.types";
