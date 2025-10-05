// FILE: src/lib/brush/core/pressure-adapter.ts
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

/* ------------------------- helpers ------------------------- */

function numOr(v: unknown, def: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : def;
}

function mapCurve(curve: PresetCurve | undefined): CurveSpec | undefined {
  if (!curve) return undefined;
  if (curve.type === "gamma")
    return { type: "gamma", gamma: numOr(curve.gamma, 1) };
  return undefined;
}

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
  return undefined;
}

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

function mapVelocityComp(
  v: BrushInputConfig["pressure"]["velocityComp"] | undefined
): VelocityCompSpec | undefined {
  if (!v) return undefined;
  return { k: numOr(v.k, 0.15), refSpeed: numOr(v.refSpeed, 1500) };
}

/* ---------------------- Public adapter --------------------- */

export function toPressureOptions(input: BrushInputConfig): PressureOptions {
  const out: Partial<PressureOptions> = {};

  const clamp = input.pressure?.clamp;
  if (clamp && (clamp.min !== undefined || clamp.max !== undefined)) {
    out.clamp = { min: numOr(clamp.min, 0), max: numOr(clamp.max, 1) };
  }

  const curve = mapCurve(input.pressure?.curve);
  if (curve) out.curve = curve;

  const smoothing = mapSmoothing(input.pressure?.smoothing);
  if (smoothing) out.smoothing = smoothing;

  const vel = mapVelocityComp(input.pressure?.velocityComp);
  if (vel) out.velocityComp = vel;

  const synth = mapSynth(input.pressure?.synth);
  if (synth) out.synth = synth;

  // It’s fine to assert here: all keys are optional and we only set defined ones
  return out as PressureOptions;
}

export function makePressureTrackerForPreset(
  preset: BrushPreset | undefined
): PressureTracker {
  if (!preset?.input) return new PressureTracker();
  return new PressureTracker(toPressureOptions(preset.input));
}
