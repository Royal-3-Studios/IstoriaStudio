// FILE: src/lib/brush/engine.ts
/**
 * Brush Engine Orchestrator
 * ------------------------------------------------------------
 * Responsibilities:
 *  - Normalize inputs (DPR, canvas size, color, engine config, overrides).
 *  - Pick an appropriate backend (or respect explicit choice).
 *  - Render into an offscreen layer, then composite with global blend/opacity.
 *
 * Backends supported:
 *  - Canvas-based: ribbon, spray, wet, impasto
 *  - Ctx-based (wrapped with "...ToCanvas"): stamping, smudge, particle, pattern
 */

import {
  createLayer,
  type Ctx2D,
  type CanvasLike,
} from "./backends/utils/canvas";
import { ensureCanvasDprSize } from "./backends/utils/offscreen";
import { createBrushContext } from "@/lib/brush/core/brushContext";
import { mulberry32 } from "./backends/utils/random";
import {
  withCompositeAndAlpha,
  toCompositeOp,
} from "./backends/utils/blending";

// Canvas-based backends (expect a Canvas)
import { drawRibbonToCanvas } from "./backends/ribbon";
import { drawSprayToCanvas } from "./backends/spray";
import { drawWetToCanvas } from "./backends/wet";
import { drawImpastoToCanvas } from "./backends/impasto";

// Ctx-based backends (provide ...ToCanvas wrappers)
import drawStamping, { drawStampingToCanvas } from "./backends/stamping";
import drawSmudge, { drawSmudgeToCanvas } from "./backends/smudge";
import drawParticle, { drawParticleToCanvas } from "./backends/particle";
import drawPattern, { drawPatternToCanvas } from "./backends/pattern";

// Types
import type { RenderOptions } from "./engine.types";
import type { BrushContextInit } from "@/lib/brush/core/brushContext";

// Utils (normalizers, backend selection, 2D guard)
import {
  normalizeOptions,
  chooseBackend,
  isCanvas2DContext,
} from "./engine.utils";

/* ========================================================================== */
/*                              Small helpers                                  */
/* ========================================================================== */

// Accept a sync return (void/T) or a Promise<T> and return a Promise<T>.
function awaitMaybe<T>(v: T | Promise<T>): Promise<T> {
  return Promise.resolve(v);
}

/* ========================================================================== */
/*                            Core internal implementation                     */
/* ========================================================================== */

async function drawStrokeToAny(
  surface: CanvasLike,
  opt: RenderOptions
): Promise<void> {
  // Normalize & choose backend
  const nopt = normalizeOptions(opt);
  const dpr = nopt.pixelRatio;

  // Build BrushContextInit without ever setting optional properties to `undefined`
  const initCtx: BrushContextInit = {
    width: nopt.width,
    height: nopt.height,
    dpr,
    seed: nopt.seed ?? 1,
    colorHex: nopt.color ?? undefined, // null -> undefined
    rngFactory: (s) => mulberry32(s),
  };

  const ssm = nopt.engine.overrides.speedSmoothingMs;
  if (ssm !== undefined) {
    initCtx.speedSmoothingMs = ssm;
  }

  // Build smudgeDefaults piecewise; assign only if any keys got set
  const sd: NonNullable<BrushContextInit["smudgeDefaults"]> = {};
  const { smudgeStrength, smudgeAlpha, smudgeBlur, smudgeSpacing } =
    nopt.engine.overrides;

  if (smudgeStrength !== undefined) sd.strength = smudgeStrength;
  if (smudgeAlpha !== undefined) sd.alphaMul = smudgeAlpha;
  if (smudgeBlur !== undefined) sd.blurPx = smudgeBlur;
  if (smudgeSpacing !== undefined) sd.spacingOverride = smudgeSpacing;

  if (Object.keys(sd).length > 0) {
    initCtx.smudgeDefaults = sd;
  }

  const brushCtx = createBrushContext(initCtx);

  // Keep type compatible with backends expecting RenderOptions (+ brushCtx)
  const optWithCtx: RenderOptions & { brushCtx: typeof brushCtx } = {
    ...nopt,
    brushCtx,
  };

  const backend = chooseBackend(nopt);

  // Target surface DPR sizing (works for OffscreenCanvas and HTMLCanvasElement)
  ensureCanvasDprSize(surface, nopt.width, nopt.height, dpr);

  // Prepare target 2D context
  const ctx = surface.getContext?.("2d", { alpha: true }) as Ctx2D | null;
  if (!isCanvas2DContext(ctx)) throw new Error("2D context unavailable");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, nopt.width, nopt.height);

  // Offscreen layer to composite at the end (pixel dimensions)
  const layer = createLayer(
    Math.max(1, Math.floor(nopt.width * dpr)),
    Math.max(1, Math.floor(nopt.height * dpr))
  );
  const lctx = layer.getContext("2d", { alpha: true }) as Ctx2D | null;
  if (!isCanvas2DContext(lctx)) throw new Error("2D layer context unavailable");
  lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  lctx.clearRect(0, 0, nopt.width, nopt.height);

  // Dispatch — canvas-based draw directly to the offscreen layer
  switch (backend) {
    case "ribbon":
      await awaitMaybe(
        drawRibbonToCanvas(layer as HTMLCanvasElement, optWithCtx)
      );
      break;
    case "spray":
      await awaitMaybe(
        drawSprayToCanvas(layer as HTMLCanvasElement, optWithCtx)
      );
      break;
    case "wet":
      await awaitMaybe(drawWetToCanvas(layer as HTMLCanvasElement, optWithCtx));
      break;
    case "stamping":
      if (typeof drawStampingToCanvas === "function") {
        await awaitMaybe(
          drawStampingToCanvas(layer as HTMLCanvasElement, optWithCtx)
        );
      } else {
        await awaitMaybe(drawStamping(lctx, optWithCtx));
      }
      break;
    case "smudge":
      if (typeof drawSmudgeToCanvas === "function") {
        await awaitMaybe(
          drawSmudgeToCanvas(layer as HTMLCanvasElement, optWithCtx)
        );
      } else {
        await awaitMaybe(drawSmudge(lctx, optWithCtx));
      }
      break;
    case "particle":
      if (typeof drawParticleToCanvas === "function") {
        await awaitMaybe(
          drawParticleToCanvas(layer as HTMLCanvasElement, optWithCtx)
        );
      } else {
        await awaitMaybe(drawParticle(lctx, optWithCtx));
      }
      break;
    case "pattern":
      if (typeof drawPatternToCanvas === "function") {
        await awaitMaybe(
          drawPatternToCanvas(layer as HTMLCanvasElement, optWithCtx)
        );
      } else {
        await awaitMaybe(drawPattern(lctx, optWithCtx));
      }
      break;
    case "impasto":
      await awaitMaybe(
        drawImpastoToCanvas(layer as HTMLCanvasElement, optWithCtx)
      );
      break;
    default:
      // Fallback to stamping
      if (typeof drawStampingToCanvas === "function") {
        await awaitMaybe(
          drawStampingToCanvas(layer as HTMLCanvasElement, optWithCtx)
        );
      } else {
        await awaitMaybe(drawStamping(lctx, optWithCtx));
      }
      break;
  }

  // Global composite: blendMode + opacity
  const blend = nopt.engine.rendering.blendMode ?? "source-over";
  const opacity01 = Math.max(
    0,
    Math.min(1, (nopt.engine.overrides.opacity ?? 100) / 100)
  );

  withCompositeAndAlpha(ctx, toCompositeOp(blend), opacity01, () => {
    // ctx is already scaled to DPR; draw in CSS space
    ctx.drawImage(layer as CanvasImageSource, 0, 0, nopt.width, nopt.height);
  });
}

/* ========================================================================== */
/*                               Public API                                   */
/* ========================================================================== */

/** Main DOM entry (HTMLCanvasElement). */
export async function drawStrokeToCanvas(
  canvas: HTMLCanvasElement,
  opt: RenderOptions
): Promise<void> {
  return drawStrokeToAny(canvas, opt);
}

/** Surface-friendly entry (HTMLCanvasElement | OffscreenCanvas). */
export async function drawStrokeToSurface(
  surface: CanvasLike,
  opt: RenderOptions
): Promise<void> {
  return drawStrokeToAny(surface, opt);
}

/** Backward-compatible alias */
export const renderBrushPreview = drawStrokeToCanvas;
export default drawStrokeToCanvas;

/* ============================== Re-exports ============================== */
/** Re-export types so existing imports from "@/lib/brush/engine" keep working. */
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
