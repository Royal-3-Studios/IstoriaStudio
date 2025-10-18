// FILE: src/lib/brush/backends/particle/index.ts

import type { RenderOptions, RenderPathPoint } from "@/lib/brush/engine.types";
import { type Ctx2D, type CanvasLike, get2D } from "@backends/utils/canvas";
import { getTiltOverrides } from "@backends/stamping/utils/scalars";

import { drawParticleToCanvas } from "./core/particle";
import type { ParticleOptions } from "./types";

/* ----------------------------- defaults & merge ---------------------------- */

function defaultParticle(): ParticleOptions {
  return {
    emitRatePerSec: 220,
    lifeMs: 950,
    sizeMinPx: 1.5,
    sizeMaxPx: 6,
    speedMin: 120,
    speedMax: 600,
    dragPerSec: 0.2,
    gravity: 900,
    angleSpreadRad: Math.PI * 0.2,
    splatterProb: 0.25,
    dripGravity: 600,
    dripStretch: 0.35,
    noiseAmount: 0.15,
    noiseScalePx: 48,
    decal: { kind: "round" },
    antiHaloPx: 0.6,
    antiHaloAlpha: 0.35,
    inkMode: "inner-grain",
  };
}

/** Merge caller’s options with defaults (no undefineds leak). */
function normalizeOptions(
  opt: RenderOptions & Partial<{ particle: Partial<ParticleOptions> }>
): RenderOptions & { particle: ParticleOptions } {
  const d = defaultParticle();
  const p = opt.particle ?? {};

  const safe: ParticleOptions = {
    emitRatePerSec:
      typeof p.emitRatePerSec === "number"
        ? p.emitRatePerSec
        : d.emitRatePerSec,
    lifeMs: typeof p.lifeMs === "number" ? p.lifeMs : d.lifeMs,
    sizeMinPx: typeof p.sizeMinPx === "number" ? p.sizeMinPx : d.sizeMinPx,
    sizeMaxPx: typeof p.sizeMaxPx === "number" ? p.sizeMaxPx : d.sizeMaxPx,
    speedMin: typeof p.speedMin === "number" ? p.speedMin : d.speedMin,
    speedMax: typeof p.speedMax === "number" ? p.speedMax : d.speedMax,
    dragPerSec: typeof p.dragPerSec === "number" ? p.dragPerSec : d.dragPerSec,
    gravity: typeof p.gravity === "number" ? p.gravity : d.gravity,
    angleSpreadRad:
      typeof p.angleSpreadRad === "number"
        ? p.angleSpreadRad
        : d.angleSpreadRad,
    splatterProb:
      typeof p.splatterProb === "number" ? p.splatterProb : d.splatterProb,
    dripGravity:
      typeof p.dripGravity === "number" ? p.dripGravity : d.dripGravity,
    dripStretch:
      typeof p.dripStretch === "number" ? p.dripStretch : d.dripStretch,
    noiseAmount:
      typeof p.noiseAmount === "number" ? p.noiseAmount : d.noiseAmount,
    noiseScalePx:
      typeof p.noiseScalePx === "number" ? p.noiseScalePx : d.noiseScalePx,
    decal: p.decal ?? d.decal, // sprite sizeScale is optional, so this is exact-optional-safe
    antiHaloPx: typeof p.antiHaloPx === "number" ? p.antiHaloPx : d.antiHaloPx,
    antiHaloAlpha:
      typeof p.antiHaloAlpha === "number" ? p.antiHaloAlpha : d.antiHaloAlpha,
    inkMode:
      p.inkMode === "rim" || p.inkMode === "inner-grain"
        ? p.inkMode
        : d.inkMode,
  };

  return { ...opt, particle: safe };
}

/* --------------------------------- entries -------------------------------- */

export function drawParticle(ctx: Ctx2D, opt: RenderOptions): void {
  // Normalize tilt routing once for parity with other backends
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

  const nopt = normalizeOptions(optWithTilt);
  const path: RenderPathPoint[] = nopt.path ?? [];
  if (path.length === 0) return;

  // ctx.canvas is HTMLCanvasElement | OffscreenCanvas → matches CanvasLike
  drawParticleToCanvas(ctx.canvas as CanvasLike, path, nopt);
}

/** Convenience wrapper: accept a surface, get a 2D context, then draw. */
export function drawToCanvas(surface: CanvasLike, opt: RenderOptions): void {
  const ctx = get2D(surface);
  drawParticle(ctx, opt);
}

export default drawToCanvas;
