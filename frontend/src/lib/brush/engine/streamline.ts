// FILE: src/lib/brush/engine/streamline.ts
/**
 * Stabilization → Engine mapping
 * ------------------------------------------------------------
 * Converts a single user-facing “Stabilization” control (0–100)
 * into engine fields:
 *   - input.quality.predictPx
 *   - input.quality.speedToSpacing
 *   - input.quality.minStepPx
 *   - engine.strokePath.streamline
 *
 * exactOptionalPropertyTypes-safe: we omit undefined keys.
 */
import { DEFAULT_INPUT } from "@/lib/brush/input";
import type { RenderOptions, EngineStrokePath } from "@/lib/brush/engine.types";
import type { BrushInputConfig } from "@/data/brushPresets";

/* ----------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

export type StabilizationMode = "balanced" | "responsive" | "accurate";

/** User-facing stabilization config. */
export type StabilizationConfig =
  | number
  | {
      level: number; // 0..100
      mode?: StabilizationMode;
    };

/** Output shape: only defined keys are emitted (exact-optional safe). */
export type StabilizationResult = {
  quality?: {
    predictPx?: number;
    speedToSpacing?: number;
    minStepPx?: number;
  };
  strokePath?: Pick<EngineStrokePath, "streamline">;
};

/* ----------------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------------- */

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Gentle S-curve that feels natural for UI sliders. */
const ease = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/** Parse incoming config/number into [0..1] + mode. */
function toUnitLevel(cfg?: StabilizationConfig): {
  u: number;
  mode: StabilizationMode;
} {
  if (typeof cfg === "number")
    return { u: clamp01(cfg / 100), mode: "balanced" };
  const level = typeof cfg?.level === "number" ? clamp(cfg.level, 0, 100) : 0;
  const mode: StabilizationMode = cfg && cfg.mode ? cfg.mode : "balanced";
  return { u: level / 100, mode };
}

/* ----------------------------------------------------------------------------
 * Core mapping
 * ------------------------------------------------------------------------- */

export function normalizeStabilization(
  cfg?: StabilizationConfig
): StabilizationResult {
  const { u, mode } = toUnitLevel(cfg);

  // Mode multipliers
  const modePredictMul =
    mode === "responsive" ? 0.75 : mode === "accurate" ? 1.25 : 1.0;
  const modeStreamMul =
    mode === "responsive" ? 0.7 : mode === "accurate" ? 1.2 : 1.0;
  const modeSpeedToSpacingMul =
    mode === "responsive" ? 0.8 : mode === "accurate" ? 1.1 : 1.0;
  const modeMinStepBias =
    mode === "responsive" ? +0.04 : mode === "accurate" ? -0.02 : 0.0;

  // Curves
  const e = ease(u);
  const predictPx = lerp(0.0, 5.5, Math.pow(e, 1.2)) * modePredictMul;
  const speedToSpacing = lerp(0.0, 0.18, e) * modeSpeedToSpacingMul;

  // Slightly smaller steps at higher stability
  const minStepPxBase = lerp(0.5, 0.34, e);
  const minStepPx = clamp(minStepPxBase + modeMinStepBias, 0.24, 1.0);

  const streamline = Math.round(lerp(0, 30, Math.pow(e, 1.05)) * modeStreamMul);

  const out: StabilizationResult = {};
  out.quality = {};
  out.strokePath = { streamline };

  // Only assign when non-zero to preserve caller defaults on merge.
  if (predictPx > 0.0001) out.quality.predictPx = predictPx;
  if (speedToSpacing > 0.0001) out.quality.speedToSpacing = speedToSpacing;
  if (minStepPx !== 0.5) out.quality.minStepPx = minStepPx;

  // Remove empty quality object if nothing set
  if (!Object.keys(out.quality).length) delete out.quality;

  return out;
}

/* ----------------------------------------------------------------------------
 * Convenience utilities
 * ------------------------------------------------------------------------- */

/** Shallow-merge stabilization onto a RenderOptions object (non-destructive). */
export function withStabilization(
  opt: RenderOptions,
  stab?: StabilizationConfig
): RenderOptions {
  const mapped = normalizeStabilization(stab);

  // --- Always materialize a BrushInputConfig (never undefined) -------------
  const baseInput: BrushInputConfig = opt.input ?? {
    pressure: {
      clamp: {
        min: DEFAULT_INPUT.pressure.clamp.min,
        max: DEFAULT_INPUT.pressure.clamp.max,
      },
      curve: DEFAULT_INPUT.pressure.curve,
      smoothing: DEFAULT_INPUT.pressure.smoothing,
      ...(DEFAULT_INPUT.pressure.velocityComp
        ? { velocityComp: DEFAULT_INPUT.pressure.velocityComp }
        : {}),
      ...(DEFAULT_INPUT.pressure.synth
        ? { synth: DEFAULT_INPUT.pressure.synth }
        : {}),
      ...(typeof DEFAULT_INPUT.pressure.gain === "number"
        ? { gain: DEFAULT_INPUT.pressure.gain }
        : {}),
      ...(typeof DEFAULT_INPUT.pressure.deadZone === "number"
        ? { deadZone: DEFAULT_INPUT.pressure.deadZone }
        : {}),
    },
    quality: {}, // will be merged below if mapped.quality exists
  };

  // Merge input.quality (keep other input fields intact)
  const inputPatched: BrushInputConfig =
    mapped.quality && Object.keys(mapped.quality).length
      ? {
          ...baseInput,
          quality: {
            ...(baseInput.quality ?? {}),
            ...mapped.quality,
          },
        }
      : baseInput;

  // Merge engine.strokePath.streamline (omit if nothing mapped)
  const enginePatched =
    mapped.strokePath && Object.keys(mapped.strokePath).length
      ? {
          ...opt.engine,
          strokePath: { ...opt.engine.strokePath, ...mapped.strokePath },
        }
      : opt.engine;

  // Return a full RenderOptions with a non-undefined input
  return {
    ...opt,
    input: inputPatched,
    engine: enginePatched,
  };
}
