// FILE: src/lib/brush/backends/impasto/core/lighting.ts
export function shadeFromHeightAlpha(
  src: ImageData,
  width: number,
  height: number,
  lightDir: { x: number; y: number; z: number },
  intensity: number,
  ambient: number
): ImageData {
  const out = new ImageData(width, height);
  const s = src.data;
  const d = out.data;

  const kx: number[] = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const ky: number[] = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  const clampIdx = (x: number, y: number): number => {
    const ix = x < 0 ? 0 : x >= width ? width - 1 : x;
    const iy = y < 0 ? 0 : y >= height ? height - 1 : y;
    return (iy * width + ix) * 4;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let gx = 0,
        gy = 0,
        k = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const idx = clampIdx(x + i, y + j);
          const h = s[idx + 3]! / 255; // alpha as height
          gx += kx[k]! * h;
          gy += ky[k]! * h;
          k++;
        }
      }
      const nx = -gx * intensity,
        ny = -gy * intensity,
        nz = 1.0;
      const inv = 1 / Math.max(1e-6, Math.hypot(nx, ny, nz));
      const nxx = nx * inv,
        nyy = ny * inv,
        nzz = nz * inv;

      const ndotl = Math.max(
        0,
        nxx * lightDir.x + nyy * lightDir.y + nzz * lightDir.z
      );
      const lambert = Math.pow(ndotl, 0.9);
      const shade = ambient + (1 - ambient) * lambert;

      const oi = (y * width + x) * 4;
      const v = Math.round(shade * 255);
      d[oi + 0] = v;
      d[oi + 1] = v;
      d[oi + 2] = v;
      d[oi + 3] = s[oi + 3]!;
    }
  }
  return out;
}
