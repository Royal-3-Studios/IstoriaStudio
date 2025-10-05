// FILE: src/lib/brush/backends/stamping/utils/scalars.ts
import { clamp, clamp01 } from "@backends/utils/math";

/** Safe override reader with default. */
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

/* ---- body/tip shaping ---- */
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

/* ---- pressure response ---- */
export function pressureToWidthScale(p01: number): number {
  const q = Math.pow(clamp01(p01), 0.65);
  return 0.85 + q * 0.45;
}

export function pressureToFlowScale(p01: number): number {
  const q = Math.pow(clamp01(p01), 1.15);
  return 0.4 + q * 0.6;
}
