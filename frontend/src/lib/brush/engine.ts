// FILE: src/lib/brush/engine.ts
/**
 * Brush Engine Orchestrator
 * ------------------------------------------------------------
 * - Normalize opts, size to DPR
 * - Pick backend
 * - Render into an offscreen layer
 * - Composite with global blend/opacity
 */

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

// All backends expose a uniform API: default draw(ctx, opt) + named drawToCanvas(surface, opt)
import { drawToCanvas as drawRibbonToCanvas } from "./backends/ribbon";
import { drawToCanvas as drawSprayToCanvas } from "./backends/spray";
import { drawToCanvas as drawWetToCanvas } from "./backends/wet";
import { drawToCanvas as drawImpastoToCanvas } from "./backends/impasto";
import { drawToCanvas as drawStampingToCanvas } from "./backends/stamping";
import { drawToCanvas as drawSmudgeToCanvas } from "./backends/smudge";
import { drawToCanvas as drawParticleToCanvas } from "./backends/particle";
import { drawToCanvas as drawPatternToCanvas } from "./backends/pattern";

import type { RenderOptions } from "./engine.types";
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
    colorHex: nopt.color, // optional already
    rngFactory: (s) => mulberry32(s),
  };

  if (nopt.engine.overrides.speedSmoothingMs !== undefined) {
    initCtx.speedSmoothingMs = nopt.engine.overrides.speedSmoothingMs;
  }

  // smudge defaults (only attach if any provided)
  const sd: NonNullable<BrushContextInit["smudgeDefaults"]> = {};
  const { smudgeStrength, smudgeAlpha, smudgeBlur, smudgeSpacing } =
    nopt.engine.overrides;
  if (smudgeStrength !== undefined) sd.strength = smudgeStrength;
  if (smudgeAlpha !== undefined) sd.alphaMul = smudgeAlpha;
  if (smudgeBlur !== undefined) sd.blurPx = smudgeBlur;
  if (smudgeSpacing !== undefined) sd.spacingOverride = smudgeSpacing;
  if (Object.keys(sd).length > 0) initCtx.smudgeDefaults = sd;

  const brushCtx = createBrushContext(initCtx);
  const optWithCtx: RenderOptions & { brushCtx: typeof brushCtx } = {
    ...nopt,
    brushCtx,
  };

  const backend = chooseBackend(nopt);

  // Size the destination surface (device pixels) and prep its 2D ctx in CSS space
  ensureCanvasDprSize(surface, nopt.width, nopt.height, dpr);
  const ctx = surface.getContext?.("2d", { alpha: true }) as Ctx2D | null;
  if (!isCanvas2DContext(ctx)) throw new Error("2D context unavailable");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, nopt.width, nopt.height);

  // Offscreen layer we render into, then composite
  const layer = createLayer(
    Math.max(1, Math.floor(nopt.width * dpr)),
    Math.max(1, Math.floor(nopt.height * dpr))
  );
  const lctx = layer.getContext("2d", { alpha: true }) as Ctx2D | null;
  if (!isCanvas2DContext(lctx)) throw new Error("2D layer context unavailable");
  lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  lctx.clearRect(0, 0, nopt.width, nopt.height);

  // Dispatch — every backend exposes drawToCanvas(CanvasLike, RenderOptions)
  switch (backend) {
    case "ribbon":
      await awaitMaybe(drawRibbonToCanvas(layer, optWithCtx));
      break;
    case "spray":
      await awaitMaybe(drawSprayToCanvas(layer, optWithCtx));
      break;
    case "wet":
      await awaitMaybe(drawWetToCanvas(layer, optWithCtx));
      break;
    case "stamping":
      await awaitMaybe(drawStampingToCanvas(layer, optWithCtx));
      break;
    case "smudge":
      await awaitMaybe(drawSmudgeToCanvas(layer, optWithCtx));
      break;
    case "particle":
      await awaitMaybe(drawParticleToCanvas(layer, optWithCtx));
      break;
    case "pattern":
      await awaitMaybe(drawPatternToCanvas(layer, optWithCtx));
      break;
    case "impasto":
      await awaitMaybe(drawImpastoToCanvas(layer, optWithCtx));
      break;
    default:
      // Fallback (shouldn’t happen if chooseBackend handles "auto")
      await awaitMaybe(drawStampingToCanvas(layer, optWithCtx));
      break;
  }

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
  canvas: HTMLCanvasElement,
  opt: RenderOptions
): Promise<void> {
  return drawStrokeToAny(canvas, opt);
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
