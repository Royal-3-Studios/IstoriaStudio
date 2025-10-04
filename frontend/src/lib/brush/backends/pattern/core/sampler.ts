// FILE: src/lib/brush/backends/pattern/core/sampler.ts

import { wrap, type WrapMode } from "./tiling";

export type RGBA = { r: number; g: number; b: number; a: number };

/** Safe bilinear sample from ImageData with wrap mode. */
export function sampleImageData(
  img: ImageData,
  x: number,
  y: number,
  wrapMode: WrapMode = "repeat"
): RGBA {
  const w = img.width,
    h = img.height;
  const data = img.data;

  const x0 = Math.floor(x),
    y0 = Math.floor(y);
  const x1 = x0 + 1,
    y1 = y0 + 1;

  const wx = x - x0,
    wy = y - y0;

  const ix0 = Math.floor(wrap(x0, w, wrapMode));
  const ix1 = Math.floor(wrap(x1, w, wrapMode));
  const iy0 = Math.floor(wrap(y0, h, wrapMode));
  const iy1 = Math.floor(wrap(y1, h, wrapMode));

  const i00 = (iy0 * w + ix0) * 4;
  const i10 = (iy0 * w + ix1) * 4;
  const i01 = (iy1 * w + ix0) * 4;
  const i11 = (iy1 * w + ix1) * 4;

  // enforce indexing safety (TypeScript)
  const r00 = data[i00] ?? 0,
    g00 = data[i00 + 1] ?? 0,
    b00 = data[i00 + 2] ?? 0,
    a00 = data[i00 + 3] ?? 0;
  const r10 = data[i10] ?? 0,
    g10 = data[i10 + 1] ?? 0,
    b10 = data[i10 + 2] ?? 0,
    a10 = data[i10 + 3] ?? 0;
  const r01 = data[i01] ?? 0,
    g01 = data[i01 + 1] ?? 0,
    b01 = data[i01 + 2] ?? 0,
    a01 = data[i01 + 3] ?? 0;
  const r11 = data[i11] ?? 0,
    g11 = data[i11 + 1] ?? 0,
    b11 = data[i11 + 2] ?? 0,
    a11 = data[i11 + 3] ?? 0;

  const r0 = r00 * (1 - wx) + r10 * wx;
  const r1 = r01 * (1 - wx) + r11 * wx;
  const g0 = g00 * (1 - wx) + g10 * wx;
  const g1 = g01 * (1 - wx) + g11 * wx;
  const b0 = b00 * (1 - wx) + b10 * wx;
  const b1 = b01 * (1 - wx) + b11 * wx;
  const a0 = a00 * (1 - wx) + a10 * wx;
  const a1 = a01 * (1 - wx) + a11 * wx;

  return {
    r: r0 * (1 - wy) + r1 * wy,
    g: g0 * (1 - wy) + g1 * wy,
    b: b0 * (1 - wy) + b1 * wy,
    a: (a0 * (1 - wy) + a1 * wy) / 255,
  };
}
