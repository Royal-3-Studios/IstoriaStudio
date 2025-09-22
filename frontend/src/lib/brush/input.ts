// FILE: src/lib/brush/input.ts
// Helpers for pressure / input-quality metadata from BrushPreset.input.
// No React here; pure functions only.

import type {
  BrushInputConfig,
  PressureCurve,
  PressureSmoothing,
  BrushPreset,
} from "@/data/brushPresets";

/* ------------------ Defaults (used if a preset omits fields) ------------------ */

export const DEFAULT_INPUT: BrushInputConfig = {
  pressure: {
    clamp: { min: 0, max: 1 },
    curve: { type: "gamma", gamma: 1 },
    smoothing: {
      mode: "oneEuro",
      oneEuro: { minCutoff: 1.5, beta: 0.03, dCutoff: 1.0 },
    },
    velocityComp: { k: 0.15, refSpeed: 1500 },
    synth: { enabled: false },
  },
  quality: {
    predictPx: 8,
    speedToSpacing: 0.12,
    minStepPx: 0.6,
  },
};

export function getInputConfig(preset?: BrushPreset): BrushInputConfig {
  const p = preset?.input;
  if (!p) return DEFAULT_INPUT;
  // Shallow merge with fallbacks to guard partial JSON
  return {
    pressure: {
      clamp: {
        min: p.pressure?.clamp?.min ?? DEFAULT_INPUT.pressure.clamp.min,
        max: p.pressure?.clamp?.max ?? DEFAULT_INPUT.pressure.clamp.max,
      },
      curve: normalizeCurve(p.pressure?.curve ?? DEFAULT_INPUT.pressure.curve),
      smoothing: normalizeSmoothing(
        p.pressure?.smoothing ?? DEFAULT_INPUT.pressure.smoothing
      ),
      velocityComp:
        p.pressure?.velocityComp ?? DEFAULT_INPUT.pressure.velocityComp,
      synth: normalizeSynth(p.pressure?.synth ?? DEFAULT_INPUT.pressure.synth),
    },
    quality: {
      predictPx: p.quality?.predictPx ?? DEFAULT_INPUT.quality.predictPx,
      speedToSpacing:
        p.quality?.speedToSpacing ?? DEFAULT_INPUT.quality.speedToSpacing,
      minStepPx: p.quality?.minStepPx ?? DEFAULT_INPUT.quality.minStepPx,
    },
  };
}

/* ------------------ Curve / smoothing normalizers ------------------ */

function normalizeCurve(c: PressureCurve): PressureCurve {
  if (c?.type === "gamma") {
    const gamma = Number(c.gamma ?? 1);
    return { type: "gamma", gamma: isFinite(gamma) ? gamma : 1 };
  }
  // Unknown → safe gamma(1)
  return { type: "gamma", gamma: 1 };
}

function normalizeSmoothing(s: PressureSmoothing): PressureSmoothing {
  if (!s)
    return {
      mode: "oneEuro",
      oneEuro: { minCutoff: 1.5, beta: 0.03, dCutoff: 1.0 },
    };
  if (s.mode === "disabled") return { mode: "disabled" };
  const oe = s.oneEuro || {};
  return {
    mode: "oneEuro",
    oneEuro: {
      minCutoff: numOr(oe.minCutoff, 1.5),
      beta: numOr(oe.beta, 0.03),
      dCutoff: numOr(oe.dCutoff, 1.0),
    },
  };
}

function normalizeSynth(
  s: BrushInputConfig["pressure"]["synth"]
): BrushInputConfig["pressure"]["synth"] {
  if (!s || s.enabled === false) return { enabled: false };
  const asAny = s;
  return {
    enabled: true,
    speedRange: [
      numOr(asAny.speedRange?.[0], 0),
      numOr(asAny.speedRange?.[1], 2000),
    ],
    minPressure: clamp01(numOr(asAny.minPressure, 0.15)),
    maxPressure: clamp01(numOr(asAny.maxPressure, 1)),
    curve: asAny.curve ?? "easeOut",
  };
}

/* ------------------ Useful transforms (optional) ------------------ */

/** Apply clamp + curve to a raw pressure value (0..1). You can plug this into your engine if desired. */
export function transformPressure(
  raw: number,
  input: BrushInputConfig
): number {
  const p0 = clamp01(raw);
  const clamped = clamp(
    p0,
    input.pressure.clamp.min ?? 0,
    input.pressure.clamp.max ?? 1
  );
  const c = input.pressure.curve;
  if (c.type === "gamma") {
    const g = isFinite(c.gamma) ? c.gamma : 1;
    // gamma curve: y = x^(gamma)
    return clamp01(Math.pow(clamped, g));
  }
  // Fallback
  return clamped;
}

/** Compute a spacing multiplier based on speed (px/s). Use with your engine’s spacing if you like. */
export function spacingWithSpeed(
  baseSpacing: number,
  speedPxPerSec: number,
  input: BrushInputConfig
): number {
  const k = input.quality.speedToSpacing ?? 0;
  if (!isFinite(k) || k === 0) return baseSpacing;
  // Simple linear: spacing = base * (1 + k * normalizedSpeed)
  // Normalize speed to ~0..1 using a reference (same as velocityComp.refSpeed)
  const ref = input.pressure.velocityComp?.refSpeed ?? 1500;
  const norm = clamp01(ref > 0 ? speedPxPerSec / ref : 0);
  return baseSpacing * (1 + k * norm);
}

/* ------------------ tiny helpers ------------------ */
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function numOr(v: unknown, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
