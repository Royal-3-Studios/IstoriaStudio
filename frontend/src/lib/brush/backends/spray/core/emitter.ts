// src/lib/brush/backends/spray/core/emitter.ts
// FILE: src/lib/brush/backends/spray/core/emitter.ts

export type EmitterParams = {
  /** Base dots per stamp step (integer >= 1). */
  dotsPerStepBase: number;
  /** Randomize step density 0..1. */
  dotsJitter01: number;
  /** Speed→density gain in [-1..+1]. Positive = more dots when moving fast. */
  speedToDensity: number;
};

export type LocalSpeedInfo = {
  /** Path-local px/step proxy (e.g., raw segment length). */
  localSegPx: number;
  /** Nominal step size in px (e.g., spacing% * baseSize). */
  nominalStepPx: number;
};

export function dotsThisStep(
  params: EmitterParams,
  rng: () => number,
  speed?: LocalSpeedInfo,
  pressure01?: number
): number {
  const base = Math.max(1, Math.round(params.dotsPerStepBase));
  let k = base;

  // speed mod
  if (speed) {
    const ratio = clamp(
      speed.localSegPx / Math.max(0.001, speed.nominalStepPx),
      0,
      4
    );
    // remap ratio 0..4 to gain around 1.0
    const gain = 1 + params.speedToDensity * (ratio - 1);
    k = Math.max(1, Math.round(k * clamp(gain, 0.25, 4)));
  }

  // pressure mod (slight)
  if (typeof pressure01 === "number") {
    k = Math.max(1, Math.round(k * clamp(0.6 + 0.8 * pressure01, 0.5, 2)));
  }

  // jitter
  if (params.dotsJitter01 > 0) {
    const j = 1 + (rng() * 2 - 1) * params.dotsJitter01;
    k = Math.max(1, Math.round(k * clamp(j, 0.25, 2)));
  }

  return k;
}

export function sampleConeAngle(
  baseAngleRad: number,
  coneAngleRad: number,
  rng: () => number
): number {
  if (coneAngleRad <= 0) return baseAngleRad;
  const half = coneAngleRad * 0.5;
  return baseAngleRad + (rng() * 2 - 1) * half;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
