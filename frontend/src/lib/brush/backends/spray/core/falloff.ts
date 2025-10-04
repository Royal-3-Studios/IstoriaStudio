// src/lib/brush/backends/spray/core/falloff.ts
// FILE: src/lib/brush/backends/spray/core/falloff.ts

/** Shape radial distribution toward center. rr in [0..1]. */
export function radialFalloff(rr: number, exp = 1.45): number {
  const r = rr < 0 ? 0 : rr > 1 ? 1 : rr;
  return Math.pow(r, exp);
}

/** Pressure → size multiplier (monotonic) */
export function pressureToSize(p01: number, exp = 0.85): number {
  const p = p01 < 0 ? 0 : p01 > 1 ? 1 : p01;
  return Math.pow(p, exp);
}

/** Pressure → alpha multiplier (monotonic) */
export function pressureToAlpha(p01: number, exp = 1.2): number {
  const p = p01 < 0 ? 0 : p01 > 1 ? 1 : p01;
  return Math.pow(p, exp);
}

/** Optional distance falloff lookup table (0..1 input → 0..1 output). */
export type FalloffLUT = ReadonlyArray<number>;

/** Sample a LUT; if not provided, returns x. */
export function sampleLUT(x: number, lut?: FalloffLUT): number {
  if (!lut || lut.length < 2) return clamp01(x);
  const xx = clamp01(x) * (lut.length - 1);
  const i = Math.floor(xx);
  const f = xx - i;
  const a = lut[i]!;
  const b = lut[Math.min(lut.length - 1, i + 1)]!;
  return a + (b - a) * f;
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
