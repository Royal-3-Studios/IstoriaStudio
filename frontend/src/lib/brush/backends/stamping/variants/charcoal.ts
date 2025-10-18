// FILE: src/lib/brush/backends/stamping/variants/charcoal.ts
import type {
  RenderOptions,
  EngineGrain,
  RenderOverrides,
  CurvePoint,
} from "@/lib/brush/engine.types";
import type { Ctx2D } from "@backends/utils/canvas";
import drawGraphite from "./graphite";

/**
 * Charcoal = Graphite with:
 *  - stronger edge carve (dry edge)
 *  - no rim highlight
 *  - noisier grain by default
 *  - still uses tilt→grainScale and tilt→edgeNoise (handled in graphite)
 *  - charcoal-biased pressure/alpha curves (only if caller didn’t set them)
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

  // Narrow motion (fixes exactOptionalPropertyTypes)
  const motion: "paperLocked" | "tipLocked" | "smudgeLocked" | "animated" =
    engine.grain?.motion ?? "paperLocked";

  // Prefer “noise” grain and ensure a usable minimum depth
  const grain: EngineGrain = {
    kind: engine.grain?.kind ?? "noise",
    depth: Math.max(engine.grain?.depth ?? 0.35, 0.2),
    scale: engine.grain?.scale ?? 1.0,
    rotate: engine.grain?.rotate ?? 0,
    motion: engine.grain?.motion ?? "paperLocked",
  };

  // Charcoal-flavored curves (used only if not provided by preset/overrides)
  const charcoalPressureToWidthCurve: ReadonlyArray<CurvePoint> = [
    { x: 0, y: 0.7 }, // stays husky at low pressure
    { x: 1, y: 1.3 }, // broad at high pressure
  ];
  const charcoalPressureToFlowCurve: ReadonlyArray<CurvePoint> = [
    { x: 0, y: 0.35 }, // dry, toothy start
    { x: 1, y: 0.95 }, // avoids “ink-black” fill
  ];

  // Build charcoal overrides without clobbering caller-provided curves
  const charcoalOverrides: Partial<RenderOverrides> = {
    ...overrides,
    rimMode: isRim(overrides.rimMode) ? overrides.rimMode : "off",
    edgeCarveAlpha: isNum(overrides.edgeCarveAlpha)
      ? overrides.edgeCarveAlpha
      : 0.42, // slightly stronger than graphite default
    innerGrainAlpha: isNum(overrides.innerGrainAlpha)
      ? overrides.innerGrainAlpha
      : 0.48,

    // Only apply charcoal curves if the preset didn’t specify them
    ...("pressureToWidthCurve" in overrides
      ? {}
      : { pressureToWidthCurve: charcoalPressureToWidthCurve }),
    ...("pressureToFlowCurve" in overrides
      ? {}
      : { pressureToFlowCurve: charcoalPressureToFlowCurve }),
  };

  const opt2: RenderOptions = {
    ...opt,
    engine: {
      ...engine,
      grain,
      overrides: charcoalOverrides,
    },
  };

  // Reuse graphite implementation (handles composite & curve evaluation)
  drawGraphite(ctx, opt2);
}

export default drawStampCharcoal;
