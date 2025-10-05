// FILE: src/lib/brush/backends/particle/index.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import {
  type Ctx2D,
  type CanvasLike,
  get2D,
} from "@/lib/brush/backends/utils/canvas";

import { drawTrail } from "./variants/trail";
import { drawSmoke } from "./variants/smoke";
import { drawSparkle } from "./variants/sparkle";

export type ParticleMode = "trail" | "smoke" | "sparkle";

/** Optional, local backend overrides carried under engine.backendOverrides.particle */
export type ParticleOverrides = Partial<{
  mode: ParticleMode;
}>;

function pickMode(opt: RenderOptions): ParticleMode {
  const local = opt.engine.backendOverrides?.particle as
    | ParticleOverrides
    | undefined;
  const m = local?.mode;
  return m === "smoke" || m === "sparkle" ? m : "trail";
}

/** Core entry: draw using the selected particle variant. */
export default function drawParticle(ctx: Ctx2D, opt: RenderOptions): void {
  switch (pickMode(opt)) {
    case "smoke":
      drawSmoke(ctx, opt);
      break;
    case "sparkle":
      drawSparkle(ctx, opt);
      break;
    case "trail":
    default:
      drawTrail(ctx, opt);
      break;
  }
}

/** Convenience: accept a canvas surface, fetch a 2D context, then draw. */
export function drawToCanvas(canvas: CanvasLike, opt: RenderOptions): void {
  const ctx = get2D(canvas);
  drawParticle(ctx, opt);
}
