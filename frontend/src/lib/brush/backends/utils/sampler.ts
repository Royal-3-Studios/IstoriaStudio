// FILE: src/lib/brush/backends/utils/sampler.ts
import type { PixelBuf } from "@/lib/brush/core/types";
import { SRGB_TO_LINEAR, LINEAR_TO_SRGB_LUT } from "./luts";

export type WrapMode = "clamp" | "repeat" | "mirror";

export type SampleRGBA8 = { r: number; g: number; b: number; a: number }; // sRGB bytes (numbers 0..255)
export type SampleLinear = { r: number; g: number; b: number; a: number }; // linear floats 0..1 (non-premul)

/** Wrap a coordinate index into [0, max-1] according to wrap mode. */
function wrap(i: number, max: number, mode: WrapMode): number {
  if (max <= 1) return 0; // degenerate axis
  if (mode === "clamp") return i < 0 ? 0 : i >= max ? max - 1 : i;
  if (mode === "repeat") return ((i % max) + max) % max;
  // mirror
  const m = max - 1;
  const period = 2 * m;
  const t = ((i % period) + period) % period;
  return t <= m ? t : period - t;
}

/** Nearest neighbor sample. Returns sRGB bytes (as numbers). */
export function sampleNearest(
  img: PixelBuf,
  x: number,
  y: number,
  wrapMode: WrapMode = "repeat"
): SampleRGBA8 {
  const w = img.width | 0;
  const h = img.height | 0;
  if (w <= 0 || h <= 0) return { r: 0, g: 0, b: 0, a: 0 };

  const ix = wrap(Math.round(x), w, wrapMode);
  const iy = wrap(Math.round(y), h, wrapMode);
  const i = (iy * w + ix) * 4;
  const d = img.data;
  return { r: d[i], g: d[i + 1], b: d[i + 2], a: d[i + 3] };
}

/** Bilinear sample in sRGB byte space. Handy for non-critical paths. */
export function sampleBilinear(
  img: PixelBuf,
  x: number,
  y: number,
  wrapMode: WrapMode = "repeat"
): SampleRGBA8 {
  const w = img.width | 0;
  const h = img.height | 0;
  if (w <= 0 || h <= 0) return { r: 0, g: 0, b: 0, a: 0 };

  const x0 = Math.floor(x),
    y0 = Math.floor(y);
  const tx = x - x0,
    ty = y - y0;
  const x1 = x0 + 1,
    y1 = y0 + 1;

  const ix0 = wrap(x0, w, wrapMode),
    ix1 = wrap(x1, w, wrapMode);
  const iy0 = wrap(y0, h, wrapMode),
    iy1 = wrap(y1, h, wrapMode);

  const d = img.data;

  const i00 = (iy0 * w + ix0) * 4;
  const i10 = (iy0 * w + ix1) * 4;
  const i01 = (iy1 * w + ix0) * 4;
  const i11 = (iy1 * w + ix1) * 4;

  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;

  const r = d[i00] * w00 + d[i10] * w10 + d[i01] * w01 + d[i11] * w11;
  const g =
    d[i00 + 1] * w00 + d[i10 + 1] * w10 + d[i01 + 1] * w01 + d[i11 + 1] * w11;
  const b =
    d[i00 + 2] * w00 + d[i10 + 2] * w10 + d[i01 + 2] * w01 + d[i11 + 2] * w11;
  const a =
    d[i00 + 3] * w00 + d[i10 + 3] * w10 + d[i01 + 3] * w01 + d[i11 + 3] * w11;

  return { r, g, b, a };
}

/** Bilinear sample converted to LINEAR (non-premultiplied) 0..1 floats. */
export function sampleBilinearLinear(
  img: PixelBuf,
  x: number,
  y: number,
  wrapMode: WrapMode = "repeat"
): SampleLinear {
  const s = sampleBilinear(img, x, y, wrapMode);
  // Index clamps to 0..255 to avoid OOB
  return {
    r: SRGB_TO_LINEAR[(s.r | 0) & 0xff],
    g: SRGB_TO_LINEAR[(s.g | 0) & 0xff],
    b: SRGB_TO_LINEAR[(s.b | 0) & 0xff],
    a: ((s.a | 0) & 0xff) / 255,
  };
}

/** Bilinear sample as LINEAR *premultiplied* RGBA (0..1). */
export function sampleBilinearLinearPremul(
  img: PixelBuf,
  x: number,
  y: number,
  wrapMode: WrapMode = "repeat"
): SampleLinear {
  const l = sampleBilinearLinear(img, x, y, wrapMode);
  return { r: l.r * l.a, g: l.g * l.a, b: l.b * l.a, a: l.a };
}

/** Fast path: bilinear sample and map back to sRGB 8-bit using a LUT. */
export function sampleBilinearToSrgb8(
  img: PixelBuf,
  x: number,
  y: number,
  wrapMode: WrapMode = "repeat"
): SampleRGBA8 {
  const lin = sampleBilinearLinear(img, x, y, wrapMode);
  const N = LINEAR_TO_SRGB_LUT.length - 1;
  const idx = (v: number) =>
    LINEAR_TO_SRGB_LUT[Math.round(Math.max(0, Math.min(1, v)) * N)];
  return {
    r: idx(lin.r),
    g: idx(lin.g),
    b: idx(lin.b),
    a: Math.max(0, Math.min(255, Math.round(lin.a * 255))),
  };
}

/** Sample with normalized UVs (0..1), optional 2x3 affine transform in pixels. */
export function sampleUVBilinearLinear(
  img: PixelBuf,
  u: number,
  v: number,
  wrapMode: WrapMode = "repeat",
  transform?: [number, number, number, number, number, number] // [a,b,c,d,tx,ty]
): SampleLinear {
  // Map UV to pixel coords
  let x = u * img.width;
  let y = v * img.height;
  if (transform) {
    const [a, b, c, d, tx, ty] = transform;
    const X = x,
      Y = y;
    x = a * X + c * Y + tx;
    y = b * X + d * Y + ty;
  }
  return sampleBilinearLinear(img, x, y, wrapMode);
}
