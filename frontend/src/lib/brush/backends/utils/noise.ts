// src/lib/brush/backends/utils/noise.ts
export function hash2(x: number, y: number) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function valueNoise2(x: number, y: number) {
  const x0 = Math.floor(x),
    y0 = Math.floor(y);
  const x1 = x0 + 1,
    y1 = y0 + 1;
  const tx = x - x0,
    ty = y - y0;
  const n00 = hash2(x0, y0),
    n10 = hash2(x1, y0),
    n01 = hash2(x0, y1),
    n11 = hash2(x1, y1);
  const u = tx * tx * (3 - 2 * tx),
    v = ty * ty * (3 - 2 * ty);
  return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v;
}
export function fbm2(
  x: number,
  y: number,
  octaves = 4,
  lacunarity = 2,
  gain = 0.5
) {
  let amp = 0.5,
    freq = 1,
    sum = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, y * freq);
    freq *= lacunarity;
    amp *= gain;
  }
  return sum;
}
