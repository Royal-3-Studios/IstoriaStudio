// FILE: src/lib/brush/backends/utils/scalars.ts
import type { RenderOverrides } from "@/lib/brush/engine.types";

/* ───────────────────────────── math utils ───────────────────────────── */
export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));
export const clamp01 = (v: number): number => clamp(v, 0, 1);

/** Safe getter for overrides with fallback (keeps exactOptionalPropertyTypes happy). */
export function ov<T extends object, K extends keyof T, F>(
  o: Partial<T> | undefined,
  key: K,
  fallback: F
): T[K] | F {
  return (
    ((o && o[key] !== undefined ? o[key] : undefined) as T[K] | undefined) ??
    fallback
  );
}

const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/* ───────────────────── body/tip shaping (existing) ───────────────────── */
export function tipBlend(
  tNorm: number,
  startAmt: number,
  endAmt: number
): number {
  const edgeFrac = 0.42;
  const d = Math.min(tNorm, 1 - tNorm);
  const a = Math.min(1, Math.max(0, d / edgeFrac));
  const aPow = Math.pow(a, 2.7);
  const towardStart = 1 - Math.min(1, tNorm * 2);
  const towardEnd = 1 - Math.min(1, (1 - tNorm) * 2);
  const amt = startAmt * towardStart + endAmt * towardEnd;
  return 1 - amt + amt * aPow;
}

export function applyEndBias(
  width: number,
  tNorm: number,
  bias: number
): number {
  const k = (tNorm - 0.5) * 2; // -1..+1
  return width * (1 + 0.28 * clamp(bias, -1, 1) * k);
}

export function applyUniformity(
  width: number,
  belly01: number,
  u: number
): number {
  const dev = 0.31 * Math.pow(belly01, 0.75);
  const devScaled = dev * (1 - clamp01(u));
  const factor = dev > 0 ? devScaled / dev : 1;
  return width * factor;
}

export function bellyAlphaDampFromProgress(progress: number): number {
  return 1 - 0.25 * Math.pow(progress, 1.7);
}

export function highPressureDamp(p01: number): number {
  const q = clamp01(p01);
  return 1 - 0.22 * Math.pow(q, 1.55);
}

export function widthEndSqueeze(tNorm: number): number {
  const edgeFrac = 0.42;
  const d = Math.min(tNorm, 1 - tNorm);
  const a = Math.min(1, Math.max(0, d / edgeFrac));
  const aPow = Math.pow(a, 2.7);
  return 0.84 + 0.12 * aPow;
}

/* ───────────────────── pressure response (existing) ──────────────────── */
export function pressureToWidthScale(p01: number): number {
  const q = Math.pow(clamp01(p01), 0.65);
  return 0.85 + q * 0.45;
}

export function pressureToFlowScale(p01: number): number {
  const q = Math.pow(clamp01(p01), 1.15);
  return 0.4 + q * 0.6;
}

/* ────────────────────────── tilt helpers (new) ───────────────────────── */

/** Average tilt (0..1) from a path (points may omit `tilt`). */
export function avgTiltFromPath(
  path: ReadonlyArray<{ tilt?: number }> | undefined
): number {
  if (!path || path.length === 0) return 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < path.length; i++) {
    const t = path[i]!.tilt;
    if (isNum(t)) {
      sum += clamp01(t);
      n++;
    }
  }
  return n ? sum / n : 0;
}

/** Pluck just the tilt route knobs from overrides with safe defaults. */
export function getTiltOverrides(
  overrides?: Partial<RenderOverrides>
): Readonly<{
  tiltToSize: number;
  tiltToFan: number;
  tiltToGrainScale: number;
  tiltToEdgeNoise: number;
}> {
  return {
    tiltToSize: isNum(overrides?.tiltToSize) ? overrides!.tiltToSize! : 0,
    tiltToFan: isNum(overrides?.tiltToFan) ? overrides!.tiltToFan! : 0,
    tiltToGrainScale: isNum(overrides?.tiltToGrainScale)
      ? overrides!.tiltToGrainScale!
      : 0,
    tiltToEdgeNoise: isNum(overrides?.tiltToEdgeNoise)
      ? overrides!.tiltToEdgeNoise!
      : 0,
  } as const;
}

/** Ellipse anisotropy factor from tilt: >1 stretches along chosen axis. */
export function fanFromTilt(avgTilt01: number, tiltToFan: number): number {
  return 1 + clamp01(tiltToFan) * clamp01(avgTilt01);
}

/** Overall size multiplier from tilt (gentle). */
export function sizeMulFromTilt(avgTilt01: number, tiltToSize: number): number {
  return 1 + clamp01(tiltToSize) * clamp01(avgTilt01);
}

/** Grain scale modulation from tilt (e.g., pencil sideways = coarser grain). */
export function grainScaleFromTilt(
  baseScale: number,
  avgTilt01: number,
  tiltToGrainScale: number,
  maxMul: number = 1.6
): number {
  const k = clamp01(tiltToGrainScale) * clamp01(avgTilt01);
  return baseScale * (1 + (maxMul - 1) * k);
}

/** Edge noise “strength” modulation from tilt (adds crisp/dry edge as you tilt). */
export function edgeNoiseFromTilt(
  baseStrength: number,
  avgTilt01: number,
  tiltToEdgeNoise: number,
  maxMul: number = 1.75
): number {
  const k = clamp01(tiltToEdgeNoise) * clamp01(avgTilt01);
  return baseStrength * (1 + (maxMul - 1) * k);
}

/** Optional rake angle bias (radians) derived from tilt (for knife). */
export function rakeBiasFromTilt(
  avgTilt01: number,
  tiltToFan: number,
  maxRad: number = Math.PI / 10 // ~18°
): number {
  return maxRad * clamp01(tiltToFan) * clamp01(avgTilt01);
}
