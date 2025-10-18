// FILE: src/lib/brush/backends/particle/variants/sparkle.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import type { Ctx2D } from "@backends/utils/canvas";
import type { ParticleOptions } from "../types";
import { drawParticleToCanvas } from "../core/particle";

/** Sparkle: tiny, high-energy specks with crisp highlights. */
function mergeSparkleOptions(
  opt: RenderOptions
): RenderOptions & { particle: ParticleOptions } {
  const baseSize = Math.max(6, opt.baseSizePx ?? 10);
  const params: ParticleOptions = {
    emitRatePerSec: 140, // fewer but brighter specks
    lifeMs: 550,
    sizeMinPx: Math.max(0.6, baseSize * 0.08),
    sizeMaxPx: Math.max(1.2, baseSize * 0.14),
    speedMin: 260,
    speedMax: 760,
    dragPerSec: 0.15, // keep them zippy
    gravity: 300,
    angleSpreadRad: Math.PI * 0.55,
    splatterProb: 0.0, // crisp specks
    dripGravity: 0,
    dripStretch: 0,
    noiseAmount: 0.06, // very subtle flicker
    noiseScalePx: 32,
    decal: { kind: "round" },
    antiHaloPx: 0.8, // sharper pinpoints
    antiHaloAlpha: 0.35,
    inkMode: "rim", // brightened rim look
  };
  return { ...opt, particle: params };
}

export function drawSparkle(ctx: Ctx2D, opt: RenderOptions): void {
  const path = opt.path ?? [];
  if (path.length < 2) return;
  // Delegate to the core particle renderer (no emitters/integrators modules needed)
  drawParticleToCanvas(
    ctx.canvas as HTMLCanvasElement,
    path,
    mergeSparkleOptions(opt)
  );
}
