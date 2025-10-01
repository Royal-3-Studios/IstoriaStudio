// FILE: src/lib/brush/engine/inputDefaults.ts
import type { BrushInputConfig } from "@/data/brushPresets";

/**
 * Minimal, robust defaults:
 * - Pressure: gamma=1, full 0..1 clamp, no smoothing, no synth, gain=1, deadZone=0
 * - Quality: neutral spacing dynamics, small sane min step
 */
export const DEFAULT_BRUSH_INPUT: BrushInputConfig = {
  pressure: {
    clamp: { min: 0, max: 1 },
    curve: { type: "gamma", gamma: 1 },
    smoothing: { mode: "disabled" },
    // keep synth optional off by default
    // synth omitted ⇒ optional
    gain: 1,
    deadZone: 0,
  },
  quality: {
    predictPx: 0,
    speedToSpacing: 0,
    minStepPx: 0.5,
  },
};

/**
 * Normalize a (possibly partial) UI input config into a complete, valid one.
 * exactOptionalPropertyTypes-safe: optional props are only included when defined.
 */
export function normalizeBrushInput(
  input?: BrushInputConfig
): BrushInputConfig {
  if (!input) return DEFAULT_BRUSH_INPUT;

  const def = DEFAULT_BRUSH_INPUT;

  // --- pressure ---
  const inP = input.pressure ?? def.pressure;

  // clamp (safe defaults + clamping)
  const minRaw = inP.clamp?.min ?? def.pressure.clamp.min;
  const maxRaw = inP.clamp?.max ?? def.pressure.clamp.max;
  const clampMin = Math.max(0, Math.min(1, minRaw));
  const clampMax = Math.max(clampMin, Math.min(1, maxRaw));

  // Start with required fields
  const pressureBase: BrushInputConfig["pressure"] = {
    clamp: { min: clampMin, max: clampMax },
    curve: inP.curve ?? def.pressure.curve,
    smoothing: inP.smoothing ?? def.pressure.smoothing,
  };

  // Conditionally add optional fields ONLY if defined
  const pressure: BrushInputConfig["pressure"] = {
    ...pressureBase,
    ...(inP.velocityComp ? { velocityComp: inP.velocityComp } : {}),
    ...(inP.synth !== undefined
      ? { synth: inP.synth }
      : def.pressure.synth !== undefined
        ? { synth: def.pressure.synth }
        : {}),
    ...(typeof inP.gain === "number"
      ? { gain: inP.gain }
      : typeof def.pressure.gain === "number"
        ? { gain: def.pressure.gain }
        : {}),
    ...(typeof inP.deadZone === "number"
      ? { deadZone: inP.deadZone }
      : typeof def.pressure.deadZone === "number"
        ? { deadZone: def.pressure.deadZone }
        : {}),
  };

  // --- quality ---
  const inQ = input.quality;
  const quality: NonNullable<BrushInputConfig["quality"]> = {
    predictPx: inQ?.predictPx ?? def.quality?.predictPx ?? 0,
    speedToSpacing: inQ?.speedToSpacing ?? def.quality?.speedToSpacing ?? 0,
    minStepPx: inQ?.minStepPx ?? def.quality?.minStepPx ?? 0.5,
  };

  return { pressure, quality };
}
