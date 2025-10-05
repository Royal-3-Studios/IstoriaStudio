// ========================
// FILE: src/lib/brush/backends/stamping/utils.ts
// ========================

import type { RenderOverrides } from "../../engine.types";

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;
export const mix = lerp;

export function ov<T>(
  overrides: Required<RenderOverrides>,
  key: keyof RenderOverrides,
  fallback: T
): T {
  const raw = (overrides as unknown as Record<string, unknown>)[key];
  return (raw as T) ?? fallback;
}

export function segmentNormal(ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  return { nx, ny };
}

// Taper & shaping
const EDGE_WINDOW_FRACTION = 0.42;
export function bellyProgress01(
  tNorm: number,
  edgeFrac = EDGE_WINDOW_FRACTION
) {
  const d = Math.min(tNorm, 1 - tNorm);
  return clamp01(d / edgeFrac);
}
export function softTipMask01(tNorm: number, edgeFrac = EDGE_WINDOW_FRACTION) {
  const p = bellyProgress01(tNorm, edgeFrac);
  const exponent = 2.7;
  return p < 1 ? Math.pow(p, exponent) : 1;
}
export function widthEndSqueeze(tNorm: number) {
  const a = softTipMask01(tNorm);
  return 0.84 + 0.12 * a;
}
export function bellyAlphaDampFromProgress(progress: number) {
  return 1 - 0.25 * Math.pow(progress, 1.7);
}
export function highPressureDamp(p01: number) {
  const q = clamp01(p01);
  return 1 - 0.22 * Math.pow(q, 1.55);
}
export function tipBlend(tNorm: number, startAmt: number, endAmt: number) {
  const a = softTipMask01(tNorm);
  const towardStart = 1 - Math.min(1, tNorm * 2);
  const towardEnd = 1 - Math.min(1, (1 - tNorm) * 2);
  const tipAmt = startAmt * towardStart + endAmt * towardEnd;
  return 1 - tipAmt + tipAmt * a;
}
export function applyEndBias(width: number, tNorm: number, bias: number) {
  const k = (tNorm - 0.5) * 2; // -1 → +1
  return width * (1 + 0.28 * bias * k);
}
export function applyUniformity(width: number, belly01: number, u: number) {
  const dev = 0.31 * Math.pow(belly01, 0.75);
  const devScaled = dev * (1 - u);
  const factor = dev > 0 ? devScaled / dev : 1;
  return width * factor;
}

// Pressure mapping
export function pressureToWidthScale(p01: number) {
  const q = Math.pow(clamp01(p01), 0.65);
  return 0.85 + q * 0.45;
}
export function pressureToFlowScale(p01: number) {
  const q = Math.pow(clamp01(p01), 1.15);
  return 0.4 + q * 0.6;
}
