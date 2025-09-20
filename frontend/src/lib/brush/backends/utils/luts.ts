// src/lib/brush/backends/utils/luts.ts

/** Clamp to [0,1] without branching noise. */
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 8-bit sRGB -> linear table (exact for codes 0..255). */
export const SRGB_TO_LINEAR = (() => {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const s = i / 255;
    t[i] = s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }
  return t;
})();

/** Analytic linear -> sRGB (returns 0..1). */
export function linearToSrgb(linear: number): number {
  const L = clamp01(linear);
  return L <= 0.0031308 ? 12.92 * L : 1.055 * Math.pow(L, 1 / 2.4) - 0.055;
}

/** Analytic linear -> sRGB 8-bit (0..255 integer). */
export function linearToSrgb8(linear: number): number {
  const v = Math.round(linearToSrgb(linear) * 255);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * High-res LUT for linear -> sRGB8, for bulk pixel work (avoid pow()).
 * Index with Math.round(clamp01(linear) * (N - 1)).
 */
export const LINEAR_TO_SRGB_LUT = (() => {
  const N = 4096; // 8192 if you want even smoother indexing
  const t = new Uint8ClampedArray(N);
  for (let i = 0; i < N; i++) {
    const L = i / (N - 1);
    // We go straight to 8-bit here to avoid extra multiply/round per sample later.
    const s = L <= 0.0031308 ? 12.92 * L : 1.055 * Math.pow(L, 1 / 2.4) - 0.055;
    t[i] = Math.round(s * 255);
  }
  return t;
})();

/** Convenience helper to sample the high-res LUT correctly. */
export function linearToSrgb8LUT(linear: number): number {
  const N = LINEAR_TO_SRGB_LUT.length;
  const idx = Math.round(clamp01(linear) * (N - 1));
  return LINEAR_TO_SRGB_LUT[idx];
}

/**
 * Bonus: a compact 256-entry linear -> sRGB8 table for cases where your linear value
 * is already quantized to 8-bit (e.g., came from a Float32->byte pass).
 */
export const LINEAR_TO_SRGB8_256 = (() => {
  const t = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    const L = i / 255;
    const s = L <= 0.0031308 ? 12.92 * L : 1.055 * Math.pow(L, 1 / 2.4) - 0.055;
    t[i] = Math.round(s * 255);
  }
  return t;
})();

/** Sample the 256-entry table by first quantizing linear to 0..255. */
export function linearToSrgb8LUT256(linear: number): number {
  const i = Math.round(clamp01(linear) * 255);
  return LINEAR_TO_SRGB8_256[i];
}
