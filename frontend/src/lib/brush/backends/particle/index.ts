import type { RenderOptions } from "@/lib/brush/engine";
import type { Ctx2D } from "./utils/canvas";
import { drawTrail } from "./variants/trail";
import { drawSmoke } from "./variants/smoke";
import { drawSparkle } from "./variants/sparkle";

export type ParticleMode = "trail" | "smoke" | "sparkle";

/** Optional, local backend overrides */
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

export default function drawParticle(ctx: Ctx2D, opt: RenderOptions): void {
  const mode = pickMode(opt);
  switch (mode) {
    case "smoke":
      drawSmoke(ctx, opt);
      break;
    case "sparkle":
      drawSparkle(ctx, opt);
      break;
    default:
      drawTrail(ctx, opt);
      break;
  }
}
