// FILE: src/lib/brush/backends/particle/variants/trail.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import type { Ctx2D } from "@backends/utils/canvas";
import type { ParticleOptions } from "../types";
import { drawParticleToCanvas } from "../core/particle";

/** Trail: soft, short-lived dots that follow the stroke. */
function mergeTrailOptions(
  opt: RenderOptions
): RenderOptions & { particle: ParticleOptions } {
  const baseSize = Math.max(6, opt.baseSizePx ?? 10);
  const scatter = Math.max(
    0,
    (opt.engine.strokePath?.scatter as number | undefined) ?? 0
  );

  const params: ParticleOptions = {
    emitRatePerSec: 160, // modest emission along motion
    lifeMs: 420, // short-lived
    sizeMinPx: Math.max(0.6, baseSize * 0.12),
    sizeMaxPx: Math.max(1.4, baseSize * 0.28),
    speedMin: 80,
    speedMax: 260,
    dragPerSec: 0.35, // gentle smoothing
    gravity: 60, // slight sag
    angleSpreadRad: Math.PI * 0.25,
    splatterProb: 0.0, // keep it clean
    dripGravity: 0, // no drips for trail
    dripStretch: 0,
    noiseAmount: 0.08, // tiny organic variation
    noiseScalePx: 56,
    decal: { kind: "round" },
    antiHaloPx: 0.5,
    antiHaloAlpha: 0.28,
    inkMode: "inner-grain",
  };

  // Nudge spread based on any stroke scatter (feels nice with jittery paths)
  params.angleSpreadRad = Math.max(
    params.angleSpreadRad,
    Math.min(Math.PI * 0.45, scatter * 0.02)
  );

  return { ...opt, particle: params };
}

export function drawTrail(ctx: Ctx2D, opt: RenderOptions): void {
  const path = opt.path ?? [];
  if (path.length < 2) return;
  drawParticleToCanvas(
    ctx.canvas as HTMLCanvasElement,
    path,
    mergeTrailOptions(opt)
  );
}
