// ========================
// FILE: src/lib/brush/backends/stamping/utils.ts
// ========================

import type { RenderOverrides } from "../../engine.types";

/** Clamp to [0,1]. */
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Linear interpolation. */
export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;
export const mix = lerp;

/**
 * Read a value from RenderOverrides with a typed fallback.
 * (Generic helper; avoids undefined writes.)
 */
export function ov<T>(
  overrides: Required<RenderOverrides>,
  key: keyof RenderOverrides,
  fallback: T
): T {
  const raw = (overrides as unknown as Record<string, unknown>)[key];
  return (raw as T) ?? fallback;
}

/** Unit normal of the segment a→b (perpendicular, left-hand). */
export function segmentNormal(ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  return { nx, ny };
}

/* ------------------------- Taper & shaping ------------------------- */

export const EDGE_WINDOW_FRACTION = 0.42;

/**
 * Belly progress (0 at ends, 1 near mid) with an adjustable edge window.
 * tNorm ∈ [0,1] along the stroke.
 */
export function bellyProgress01(
  tNorm: number,
  edgeFrac = EDGE_WINDOW_FRACTION
) {
  const t = clamp01(tNorm);
  const d = Math.min(t, 1 - t);
  return clamp01(d / edgeFrac);
}

/** Soft tip mask (0 near tips, →1 in the body). */
export function softTipMask01(tNorm: number, edgeFrac = EDGE_WINDOW_FRACTION) {
  const p = bellyProgress01(tNorm, edgeFrac);
  const exponent = 2.7;
  return p < 1 ? Math.pow(p, exponent) : 1;
}

/** Subtle squeeze near stroke ends. */
export function widthEndSqueeze(tNorm: number) {
  const a = softTipMask01(tNorm);
  return 0.84 + 0.12 * a;
}

/** Reduce alpha slightly where the stroke is thickest (belly). */
export function bellyAlphaDampFromProgress(progress: number) {
  return 1 - 0.25 * Math.pow(clamp01(progress), 1.7);
}

/** Damp high pressures to avoid over-blown tips. */
export function highPressureDamp(p01: number) {
  const q = clamp01(p01);
  return 1 - 0.22 * Math.pow(q, 1.55);
}

/**
 * Blend body/tip response; lets you bias start vs end tapering separately.
 * startAmt/endAmt ∈ [0..1] are the “tip strength” near each end.
 */
export function tipBlend(tNorm: number, startAmt: number, endAmt: number) {
  const a = softTipMask01(tNorm);
  const towardStart = 1 - Math.min(1, tNorm * 2); // 1→0 across first half
  const towardEnd = 1 - Math.min(1, (1 - tNorm) * 2); // 1→0 across last half
  const tipAmt = startAmt * towardStart + endAmt * towardEnd;
  return 1 - tipAmt + tipAmt * a; // body (a≈1) keeps width; tips (a≈0) reduce width by tipAmt
}

/** Bias thickness toward start or end; bias∈[-1..+1] typical. */
export function applyEndBias(width: number, tNorm: number, bias: number) {
  const k = (clamp01(tNorm) - 0.5) * 2; // -1 → +1
  return width * (1 + 0.28 * bias * k);
}

/**
 * Make the profile less “belly heavy” as uniformity goes up.
 * u∈[0..1]; belly01 is from bellyProgress01.
 */
export function applyUniformity(width: number, belly01: number, u: number) {
  const dev = 0.31 * Math.pow(clamp01(belly01), 0.75);
  const devScaled = dev * (1 - clamp01(u));
  const factor = dev > 0 ? devScaled / dev : 1;
  return width * factor;
}

/* ------------------------- Pressure mapping ------------------------- */

/** Map pressure to tip width scale (soft gamma curve). */
export function pressureToWidthScale(p01: number) {
  const q = Math.pow(clamp01(p01), 0.65);
  return 0.85 + q * 0.45;
}

/** Map pressure to flow/opacity scale. */
export function pressureToFlowScale(p01: number) {
  const q = Math.pow(clamp01(p01), 1.15);
  return 0.4 + q * 0.6;
}
