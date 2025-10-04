// FILE: src/lib/brush/backends/pattern/core/noise.ts
import type { RNG } from "../utils/rng";

function hash2iSeeded(x: number, y: number, salt: number): number {
  let v = ((x ^ salt) * 73856093) ^ ((y ^ (salt >>> 1)) * 19349663);
  v ^= v << 13;
  v ^= v >> 17;
  v ^= v << 5;
  return (v >>> 0) / 4294967296;
}

/** Value noise (lattice) with bilinear blend + salt. */
function valueNoise2Seeded(x: number, y: number, salt: number): number {
  const xi = Math.floor(x),
    yi = Math.floor(y);
  const tx = x - xi,
    ty = y - yi;
  const n00 = hash2iSeeded(xi, yi, salt);
  const n10 = hash2iSeeded(xi + 1, yi, salt);
  const n01 = hash2iSeeded(xi, yi + 1, salt);
  const n11 = hash2iSeeded(xi + 1, yi + 1, salt);
  const nx0 = n00 * (1 - tx) + n10 * tx;
  const nx1 = n01 * (1 - tx) + n11 * tx;
  return nx0 * (1 - ty) + nx1 * ty;
}

export function fbm2Seeded(
  x: number,
  y: number,
  octaves = 4,
  persistence = 0.5,
  lacunarity = 2.0,
  salt = 0
): number {
  let amp = 1,
    freq = 1,
    sum = 0,
    norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2Seeded(x * freq, y * freq, salt) * amp;
    norm += amp;
    amp *= persistence;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

/** Seedable FBM tile. Pass either `seed` or an `rng` to derive a salt. */
export function makeFbmTile(
  w: number,
  h: number,
  opts?: {
    scale?: number;
    octaves?: number;
    seed?: number;
    rng?: RNG;
  }
): ImageData {
  const scale = Math.max(1, Math.floor(opts?.scale ?? 8));
  const octaves = Math.max(1, Math.floor(opts?.octaves ?? 4));
  const salt =
    typeof opts?.seed === "number"
      ? opts.seed >>> 0
      : opts?.rng
        ? Math.floor(opts.rng.nextFloat() * 0xffffffff) >>> 0
        : 0;

  const id = new ImageData(w, h);
  const d = id.data;
  for (let y = 0, p = 0; y < h; y++) {
    for (let x = 0; x < w; x++, p += 4) {
      const n = fbm2Seeded(x / scale, y / scale, octaves, 0.5, 2.0, salt);
      const v = Math.round(255 * n);
      d[p] = v;
      d[p + 1] = v;
      d[p + 2] = v;
      d[p + 3] = 255;
    }
  }
  return id;
}
