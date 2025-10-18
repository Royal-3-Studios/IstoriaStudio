// FILE: src/lib/brush/backends/stamping/core/inputMap.ts

import type { PressureMapOpts } from "@/lib/brush/core/pressure";
import type { BrushInputConfig } from "@/lib/brush/engine.types";
import type { InputQualityOpts } from "@backends/utils/stroke";

/* =============================================================================
 * Concrete defaults
 * ============================================================================= */

const DEFAULT_GAMMA = 1;
const DEFAULT_DEADZONE = 0;
const DEFAULT_GAIN = 1;

const DEFAULT_IQ: Required<InputQualityOpts> = {
  predictPx: 0,
  speedToSpacing: 0,
  minStepPx: 0.5,
};

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/* =============================================================================
 * Pressure map (pointer → normalized pressure shaping)
 * ============================================================================= */

export function toPressureMapFromInput(
  input?: BrushInputConfig
): PressureMapOpts {
  // start with concrete numbers (no undefined)
  let gamma: number = DEFAULT_GAMMA;
  let deadZone: number = DEFAULT_DEADZONE;
  let gain: number = DEFAULT_GAIN;

  if (input) {
    // gamma from curve (only when type === "gamma")
    if (
      input.pressure?.curve?.type === "gamma" &&
      isNumber(input.pressure.curve.gamma)
    ) {
      gamma = input.pressure.curve.gamma;
    }

    // deadZone from clamp.min → clamp to [0, 0.5]
    if (isNumber(input.pressure?.clamp?.min)) {
      deadZone = Math.max(0, Math.min(0.5, input.pressure.clamp.min));
    }

    // optional pressure gain
    if (isNumber(input.pressure?.gain)) {
      gain = input.pressure.gain;
    }
  }

  // fully concrete; satisfies exactOptionalPropertyTypes
  const out: PressureMapOpts = { gamma, deadZone, gain };
  return out;
}

/* =============================================================================
 * Input quality (prediction / velocity-aware spacing / min step)
 * ============================================================================= */

export function toInputQualityFromInput(
  input?: BrushInputConfig
): Required<InputQualityOpts> {
  let predictPx = DEFAULT_IQ.predictPx;
  let speedToSpacing = DEFAULT_IQ.speedToSpacing;
  let minStepPx = DEFAULT_IQ.minStepPx;

  if (input) {
    if (isNumber(input.quality?.predictPx)) {
      predictPx = Math.max(0, Math.min(24, input.quality.predictPx));
    }
    if (isNumber(input.quality?.speedToSpacing)) {
      // allow modest tightening/loosening with speed
      speedToSpacing = Math.max(
        -0.3,
        Math.min(0.5, input.quality.speedToSpacing)
      );
    }
    if (isNumber(input.quality?.minStepPx)) {
      minStepPx = Math.max(0.25, input.quality.minStepPx);
    }
  }

  return { predictPx, speedToSpacing, minStepPx };
}

/* =============================================================================
 * Back-compat alias
 * ============================================================================= */

export const buildPressureMapFromInput = toPressureMapFromInput;
