// FILE: src/lib/brush/backends/particle/index.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import { type Ctx2D, type CanvasLike, get2D } from "@backends/utils/canvas";

import { drawTrail } from "./variants/trail";
import { drawSmoke } from "./variants/smoke";
import { drawSparkle } from "./variants/sparkle";

// Normalize tilt routing (tilt→size/fan/grainScale/edgeNoise) once per backend.
import { getTiltOverrides } from "@backends/stamping/utils/scalars";

export type ParticleMode = "trail" | "smoke" | "sparkle";

/** Optional, local backend overrides carried under engine.backendOverrides.particle */
export type ParticleOverrides = Partial<{
  mode: ParticleMode;
}>;

export function pickMode(opt: RenderOptions): ParticleMode {
  const local = opt.engine.backendOverrides?.particle as
    | ParticleOverrides
    | undefined;
  const m = local?.mode;
  return m === "smoke" || m === "sparkle" ? m : "trail";
}

/** Core entry: draw using the selected particle variant. */
export default function drawParticle(ctx: Ctx2D, opt: RenderOptions): void {
  // Merge normalized tilt knobs into overrides so variants can just read them.
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
    case "smoke":
      drawSmoke(ctx, optWithTilt);
      break;
    case "sparkle":
      drawSparkle(ctx, optWithTilt);
      break;
    case "trail":
    default:
      drawTrail(ctx, optWithTilt);
      break;
  }
}

/** Convenience: accept a canvas surface, fetch a 2D context, then draw. */
export function drawToCanvas(canvas: CanvasLike, opt: RenderOptions): void {
  const ctx = get2D(canvas);
  drawParticle(ctx, opt);
}
