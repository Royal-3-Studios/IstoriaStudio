// FILE: src/lib/brush/input.ts
// Helpers for pressure / input-quality metadata from BrushPreset.input.
// Pure functions only (no DOM/React).

import type {
  BrushInputConfig,
  PressureCurve,
  PressureSmoothing,
  PressureSynth,
  BrushPreset,
} from "@/data/brushPresets";

/* ────────────────────────────── Internal required shapes ──────────────────────────────
   BrushInputConfig.quality has optional props for the UI schema, but we want a
   concrete, required shape for runtime defaults and math. */
type QualityRequired = {
  predictPx: number;
  speedToSpacing: number;
  minStepPx: number;
};

/* ────────────────────────────── Defaults ────────────────────────────── */

const DEFAULT_GAMMA = 1;

const DEFAULT_CURVE_GAMMA: Extract<PressureCurve, { type: "gamma" }> = {
  type: "gamma",
  gamma: DEFAULT_GAMMA,
};

const DEFAULT_ONE_EURO = {
  minCutoff: 1.5,
  beta: 0.03,
  dCutoff: 1.0,
};

const DEFAULT_SMOOTHING: PressureSmoothing = {
  mode: "oneEuro",
  oneEuro: { ...DEFAULT_ONE_EURO },
};

const DEFAULT_VELOCITY = { k: 0.15, refSpeed: 1500 } as const;

const DEFAULT_SYNTH_DISABLED: PressureSynth = { enabled: false };

const DEFAULT_PRESSURE: BrushInputConfig["pressure"] = {
  clamp: { min: 0, max: 1 },
  curve: DEFAULT_CURVE_GAMMA,
  smoothing: DEFAULT_SMOOTHING,
  velocityComp: { ...DEFAULT_VELOCITY },
  synth: DEFAULT_SYNTH_DISABLED,
};

const DEFAULT_QUALITY: QualityRequired = {
  predictPx: 8,
  speedToSpacing: 0.12,
  minStepPx: 0.6,
};

export const DEFAULT_INPUT: BrushInputConfig = {
  pressure: { ...DEFAULT_PRESSURE },
  quality: { ...DEFAULT_QUALITY },
};

/* ────────────────────────────── Tiny helpers ────────────────────────────── */

function numOr(v: unknown, def: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : def;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function isValidSynthCurve(
  c: unknown
): c is "linear" | "easeIn" | "easeOut" | "easeInOut" {
  return (
    c === "linear" || c === "easeIn" || c === "easeOut" || c === "easeInOut"
  );
}

/* ────────────────────────────── Curve helpers ────────────────────────────── */

function normalizeCurve(c?: PressureCurve): PressureCurve {
  if (!c) return { ...DEFAULT_CURVE_GAMMA };

  switch (c.type) {
    case "gamma":
      return { type: "gamma", gamma: numOr(c.gamma, DEFAULT_GAMMA) };

    case "cubic": {
      const p0 = numOr(c.p0, 0);
      const p1 = numOr(c.p1, 0);
      const p2 = numOr(c.p2, 1);
      const p3 = numOr(c.p3, 1);
      return { type: "cubic", p0, p1, p2, p3 };
    }
  }
}

function applyCurve(t: number, curve: PressureCurve): number {
  // t assumed clamped [0,1]
  switch (curve.type) {
    case "gamma": {
      const g = numOr(curve.gamma, DEFAULT_GAMMA);
      return clamp01(Math.pow(t, g));
    }
    case "cubic": {
      const { p0, p1, p2, p3 } = curve;
      const u = 1 - t;
      const v =
        u * u * u * p0 +
        3 * u * u * t * p1 +
        3 * u * t * t * p2 +
        t * t * t * p3;
      return clamp01(v);
    }
  }
}

/* ────────────────────────────── Smoothing & Synth ────────────────────────────── */

function normalizeSmoothing(s?: PressureSmoothing): PressureSmoothing {
  if (!s) return { ...DEFAULT_SMOOTHING };
  if (s.mode === "disabled") return { mode: "disabled" };

  // s.mode === "oneEuro"
  const src = s.oneEuro ?? DEFAULT_ONE_EURO;
  return {
    mode: "oneEuro",
    oneEuro: {
      minCutoff: numOr(src.minCutoff, DEFAULT_ONE_EURO.minCutoff),
      beta: numOr(src.beta, DEFAULT_ONE_EURO.beta),
      dCutoff: numOr(src.dCutoff, DEFAULT_ONE_EURO.dCutoff),
    },
  };
}

/** Return a strict PressureSynth union (no optionals when enabled). */
function normalizeSynth(s?: PressureSynth): PressureSynth {
  if (!s || s.enabled === false) return { enabled: false };

  // enabled: true
  const speedRange: [number, number] = Array.isArray(s.speedRange)
    ? [numOr(s.speedRange[0], 0), numOr(s.speedRange[1], 2000)]
    : [0, 2000];

  const minPressure = clamp01(numOr(s.minPressure, 0.15));
  const maxPressure = clamp01(numOr(s.maxPressure, 1));
  const curve = isValidSynthCurve(s.curve) ? s.curve : "linear"; // required

  const out: Extract<PressureSynth, { enabled: true }> = {
    enabled: true,
    speedRange,
    minPressure,
    maxPressure,
    curve,
  };
  return out;
}

/* ────────────────────────────── Public API ────────────────────────────── */

/**
 * Returns a BrushInputConfig matching your schema exactly.
 * Optional keys are included only when concrete (never `undefined`).
 */
export function getInputConfig(preset?: BrushPreset): BrushInputConfig {
  const p = preset?.input;

  // ---- pressure ----
  const clampMin = p?.pressure?.clamp?.min ?? DEFAULT_PRESSURE.clamp.min;
  const clampMax = p?.pressure?.clamp?.max ?? DEFAULT_PRESSURE.clamp.max;

  const pressure: BrushInputConfig["pressure"] = {
    clamp: { min: clampMin, max: clampMax },
    curve: normalizeCurve(p?.pressure?.curve),
    smoothing: normalizeSmoothing(p?.pressure?.smoothing),
  };

  // velocityComp: always concrete (default if absent)
  {
    const vc = p?.pressure?.velocityComp ?? DEFAULT_VELOCITY;
    pressure.velocityComp = {
      k: numOr(vc.k, DEFAULT_VELOCITY.k),
      refSpeed: numOr(vc.refSpeed, DEFAULT_VELOCITY.refSpeed),
    };
  }

  // synth: strict discriminated union
  pressure.synth = normalizeSynth(p?.pressure?.synth);

  // optional extras (only when provided)
  if (typeof p?.pressure?.gain === "number") {
    pressure.gain = p.pressure.gain;
  }
  if (typeof p?.pressure?.deadZone === "number") {
    pressure.deadZone = p.pressure.deadZone;
  }

  // ---- quality ---- — produce a required concrete shape
  const quality: QualityRequired = {
    predictPx: numOr(p?.quality?.predictPx, DEFAULT_QUALITY.predictPx),
    speedToSpacing: numOr(
      p?.quality?.speedToSpacing,
      DEFAULT_QUALITY.speedToSpacing
    ),
    minStepPx: numOr(p?.quality?.minStepPx, DEFAULT_QUALITY.minStepPx),
  };

  return { pressure, quality };
}

/** Apply clamp + curve to a raw pressure value (0..1). */
export function transformPressure(
  raw: number,
  input: BrushInputConfig
): number {
  const p0 = clamp01(raw);
  const clamped = clamp(p0, input.pressure.clamp.min, input.pressure.clamp.max);
  return applyCurve(clamped, input.pressure.curve);
}

/** Compute spacing multiplier based on speed (px/s). */
export function spacingWithSpeed(
  baseSpacing: number,
  speedPxPerSec: number,
  input: BrushInputConfig
): number {
  // be robust even if a caller hands an un-normalized config
  const k = input.quality?.speedToSpacing ?? 0;
  if (!Number.isFinite(k) || k === 0) return baseSpacing;

  const ref =
    input.pressure.velocityComp?.refSpeed ?? DEFAULT_VELOCITY.refSpeed;
  const norm = ref > 0 ? clamp01(speedPxPerSec / ref) : 0;
  return baseSpacing * (1 + k * norm);
}
