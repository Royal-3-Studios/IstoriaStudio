// FILE: src/lib/brush/core/pressure-adapter.ts
// Adapt your BrushPreset.input → engine/core PressureOptions and Tracker (no `any`).

import type {
  BrushPreset,
  BrushInputConfig,
  PressureCurve as PresetCurve,
  PressureSmoothing as PresetSmoothing,
} from "@/data/brushPresets";

import {
  PressureTracker,
  type PressureOptions,
  type CurveSpec,
  type SmootherSpec,
  type SynthesisSpec,
  type VelocityCompSpec,
} from "./pressure";

/* ------------------------- Type-safe helpers ------------------------- */

function numOr(v: unknown, def: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : def;
}

/** Map preset curve → engine curve. Extend here if you add more curve types. */
function mapCurve(curve: PresetCurve | undefined): CurveSpec | undefined {
  if (!curve) return undefined;
  if (curve.type === "gamma") {
    return { type: "gamma", gamma: numOr(curve.gamma, 1) };
  }
  // Unknown preset curve types → omit to keep engine neutral
  return undefined;
}

/** Map preset smoothing → engine smoother. */
function mapSmoothing(
  s: PresetSmoothing | undefined
): SmootherSpec | undefined {
  if (!s) return undefined;
  if (s.mode === "disabled") return { mode: "none" };
  if (s.mode === "oneEuro") {
    const oe = s.oneEuro ?? { minCutoff: 1.5, beta: 0.03, dCutoff: 1.0 };
    return {
      mode: "oneEuro",
      oneEuro: {
        minCutoff: numOr(oe.minCutoff, 1.5),
        beta: numOr(oe.beta, 0.03),
        dCutoff: numOr(oe.dCutoff, 1.0),
      },
    };
  }
  // Unknown mode → omit to use engine defaults
  return undefined;
}

/** Map preset synth → engine synth. */
function mapSynth(
  synth: BrushInputConfig["pressure"]["synth"] | undefined
): SynthesisSpec | undefined {
  if (!synth || synth.enabled === false) return undefined;
  const [v0, v1] = synth.speedRange ?? [0, 2000];
  return {
    enabled: true,
    speedRange: [numOr(v0, 0), numOr(v1, 2000)],
    minPressure: numOr(synth.minPressure, 0.15),
    maxPressure: numOr(synth.maxPressure, 1),
    curve: synth.curve ?? "linear",
  };
}

/** Map preset velocity compensation directly. */
function mapVelocityComp(
  v: BrushInputConfig["pressure"]["velocityComp"] | undefined
): VelocityCompSpec | undefined {
  if (!v) return undefined;
  return {
    k: numOr(v.k, 0.15),
    refSpeed: numOr(v.refSpeed, 1500),
  };
}

/* ---------------------- Public adapter functions --------------------- */

/**
 * Convert a BrushInputConfig → PressureOptions understood by PressureTracker.
 * Leaves fields undefined to allow engine defaults when preset omits things.
 */
export function toPressureOptions(input: BrushInputConfig): PressureOptions {
  const clamp = input.pressure?.clamp;
  return {
    clamp: clamp
      ? { min: numOr(clamp.min, 0), max: numOr(clamp.max, 1) }
      : undefined,
    curve: mapCurve(input.pressure?.curve),
    smoothing: mapSmoothing(input.pressure?.smoothing),
    velocityComp: mapVelocityComp(input.pressure?.velocityComp),
    synth: mapSynth(input.pressure?.synth),
  };
}

/** Build a tracker directly from a preset (uses preset.input; falls back to engine defaults). */
export function makePressureTrackerForPreset(
  preset: BrushPreset | undefined
): PressureTracker {
  if (!preset?.input) {
    // Use PressureTracker internal defaults
    return new PressureTracker();
  }
  return new PressureTracker(toPressureOptions(preset.input));
}
