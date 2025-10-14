// FILE: src/lib/brush/backends/stamping/variants/charcoal.ts
import type {
  RenderOptions,
  EngineGrain,
  RenderOverrides,
} from "@/lib/brush/engine.types";
import type { Ctx2D } from "@backends/utils/canvas";
import { drawGraphite } from "./graphite";

/**
 * Charcoal = Graphite with:
 *  - stronger edge carve (dry edge)
 *  - no rim highlight
 *  - noisier grain by default
 *  - still uses tilt→grainScale and tilt→edgeNoise (read from overrides)
 */

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function isRim(v: unknown): v is "auto" | "on" | "off" {
  return v === "auto" || v === "on" || v === "off";
}

export function drawStampCharcoal(ctx: Ctx2D, opt: RenderOptions): void {
  const engine = opt.engine ?? ({} as RenderOptions["engine"]);
  const overrides = engine.overrides ?? {};

  // Narrow motion to a non-undefined literal union first
  // (fixes exactOptionalPropertyTypes)
  const motion: "paperLocked" | "tipLocked" | "smudgeLocked" | "animated" =
    engine.grain?.motion ?? "paperLocked";

  // Prefer noise grain and a minimum depth; caller can still override via opt.engine.grain
  const grain: EngineGrain = {
    kind: engine.grain?.kind ?? "noise",
    depth: Math.max(engine.grain?.depth ?? 0.35, 0.2),
    scale: engine.grain?.scale ?? 1.0,
    rotate: engine.grain?.rotate ?? 0,
    motion, // ← narrowed, never undefined
  };

  // Charcoal-flavored overrides (typed and exact-optional safe)
  const charcoalOverrides: Partial<RenderOverrides> = {
    ...overrides,
    rimMode: isRim(overrides.rimMode) ? overrides.rimMode : "off",
    edgeCarveAlpha: isNum(overrides.edgeCarveAlpha)
      ? overrides.edgeCarveAlpha
      : 0.38,
    innerGrainAlpha: isNum(overrides.innerGrainAlpha)
      ? overrides.innerGrainAlpha
      : 0.42,
  };

  const opt2: RenderOptions = {
    ...opt,
    engine: {
      ...engine,
      grain,
      overrides: charcoalOverrides,
    },
  };

  // Reuse graphite implementation (already wires tilt→grainScale & tilt→edgeNoise)
  drawGraphite(ctx, opt2);
}

export default drawStampCharcoal;
