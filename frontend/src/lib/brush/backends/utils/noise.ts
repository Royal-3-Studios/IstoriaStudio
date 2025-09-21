// src/lib/brush/backends/utils/noise.ts

/** Fast 2D integer hash -> [0,1). Deterministic. */
export function hash2(x: number, y: number): number {
  // work in 32-bit int space
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Optional: seedable variant (same distribution), useful for tiles. */
export function hash2s(x: number, y: number, seed = 0): number {
  let h = ((x | 0) * 374761393) ^ ((y | 0) * 668265263) ^ (seed | 0);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smoothstep used for interpolation (Perlin-style fade). */
const fade = (t: number) => t * t * (3 - 2 * t);

/** Classic 2D value noise in [0,1). */
export function valueNoise2(x: number, y: number): number {
  const x0 = Math.floor(x),
    y0 = Math.floor(y);
  const x1 = x0 + 1,
    y1 = y0 + 1;

  const tx = x - x0,
    ty = y - y0;
  const u = fade(tx),
    v = fade(ty);

  const n00 = hash2(x0, y0);
  const n10 = hash2(x1, y0);
  const n01 = hash2(x0, y1);
  const n11 = hash2(x1, y1);

  const nx0 = n00 * (1 - u) + n10 * u;
  const nx1 = n01 * (1 - u) + n11 * u;
  return nx0 * (1 - v) + nx1 * v;
}

/**
 * Fractal Brownian Motion (FBM) using valueNoise2.
 * Returns approx [0,1) when normalized; see fbm2Normalized below.
 */
export function fbm2(
  x: number,
  y: number,
  octaves = 4,
  lacunarity = 2,
  gain = 0.5
): number {
  let amp = 0.5;
  let freq = 1.0;
  let sum = 0.0;

  for (let i = 0; i < Math.max(1, octaves | 0); i++) {
    sum += amp * valueNoise2(x * freq, y * freq);
    freq *= lacunarity;
    amp *= gain;
  }
  return sum; // unnormalized
}

/** FBM normalized to ~[0,1) using the geometric series denominator. */
export function fbm2Normalized(
  x: number,
  y: number,
  octaves = 4,
  lacunarity = 2,
  gain = 0.5
): number {
  const denom = gain <= 0 ? 1 : 1 - Math.pow(gain, Math.max(1, octaves | 0));
  const s = fbm2(x, y, octaves, lacunarity, gain);
  return denom > 0 ? s / denom : s;
}
