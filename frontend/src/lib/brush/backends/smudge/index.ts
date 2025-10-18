// FILE: src/lib/brush/backends/smudge/index.ts

import type { RenderOptions } from "@/lib/brush/engine.types";
import { type Ctx2D, type CanvasLike, get2D } from "@backends/utils/canvas";
import { getTiltOverrides } from "@backends/stamping/utils/scalars";

import { drawSmudgeToCanvas } from "./core/smudge";
import type { SmudgeOptions } from "./types";

/* ----------------------------- defaults & merge ----------------------------- */

/** Hard defaults (all numeric; exactOptionalPropertyTypes-safe). */
function defaultSmudge(): SmudgeOptions {
  return {
    baseSizePx: 18,
    strengthPct: 70, // 0..100
    scatterPx: 0, // px
    minStepMs: 8, // ms
    dirtyAmountPct: 60, // keep % of pigment each mix
    dirtyEvapPct: 15, // fade % per step
    softenPx: 0, // px blur when mixing into tip
  };
}

/** Merge caller’s options with defaults safely. */
function normalizeOptions(
  opt: RenderOptions & Partial<{ smudge: Partial<SmudgeOptions> }>
): RenderOptions & { smudge: SmudgeOptions } {
  const d = defaultSmudge();
  const s = opt.smudge ?? {};
  const safe: SmudgeOptions = {
    baseSizePx: typeof s.baseSizePx === "number" ? s.baseSizePx : d.baseSizePx,
    strengthPct:
      typeof s.strengthPct === "number" ? s.strengthPct : d.strengthPct,
    scatterPx: typeof s.scatterPx === "number" ? s.scatterPx : d.scatterPx,
    minStepMs: typeof s.minStepMs === "number" ? s.minStepMs : d.minStepMs,
    dirtyAmountPct:
      typeof s.dirtyAmountPct === "number"
        ? s.dirtyAmountPct
        : d.dirtyAmountPct,
    dirtyEvapPct:
      typeof s.dirtyEvapPct === "number" ? s.dirtyEvapPct : d.dirtyEvapPct,
    softenPx: typeof s.softenPx === "number" ? s.softenPx : d.softenPx,
  };
  return { ...(opt as RenderOptions), smudge: safe };
}

/* --------------------------------- entries --------------------------------- */

/** Draw with an existing 2D context (DOM or Offscreen). */
export function drawSmudge(ctx: Ctx2D, opt: RenderOptions): void {
  // Normalize tilt controls once (kept for parity even if smudge doesn't use tilt directly now).
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
  if (!path) throw new Error("smudge/index: RenderOptions.path is missing");

  // ctx.canvas is HTMLCanvasElement | OffscreenCanvas → matches CanvasLike
  drawSmudgeToCanvas(ctx.canvas as CanvasLike, path, nopt);
}

/** Convenience: accept a surface and fetch a context, then draw. */
export function drawToCanvas(surface: CanvasLike, opt: RenderOptions): void {
  const ctx = get2D(surface);
  drawSmudge(ctx, opt);
}

export default drawToCanvas;
