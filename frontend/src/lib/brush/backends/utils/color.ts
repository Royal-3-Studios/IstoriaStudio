import { SRGB_TO_LINEAR, linearToSrgb8LUT } from "./luts";
import type { RGBA } from "@/lib/brush/core/types";

/** Clamp a number to [0, 1]. */
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Clamp + round to [0, 255] int for LUT indexing. */
const idx8 = (v: number) => {
  const r = Math.round(v);
  return r < 0 ? 0 : r > 255 ? 255 : r;
};

/** sRGB 8-bit -> linear (non-premultiplied) RGBA in 0..1 */
export function srgb8ToLinear(
  r: number,
  g: number,
  b: number,
  a: number
): RGBA {
  return {
    r: SRGB_TO_LINEAR[idx8(r)],
    g: SRGB_TO_LINEAR[idx8(g)],
    b: SRGB_TO_LINEAR[idx8(b)],
    a: idx8(a) / 255,
  };
}

/** linear (non-premul) RGBA 0..1 -> sRGB 8-bit (0..255 ints), fast LUT path */
export function linearToSrgb8(
  r: number,
  g: number,
  b: number,
  a: number
): { r: number; g: number; b: number; a: number } {
  return {
    r: linearToSrgb8LUT(clamp01(r)),
    g: linearToSrgb8LUT(clamp01(g)),
    b: linearToSrgb8LUT(clamp01(b)),
    a: idx8(clamp01(a) * 255),
  };
}

/** Premultiply linear RGB by alpha (expects 0..1 channels). */
export function premultiply(r: number, g: number, b: number, a: number) {
  return { r: r * a, g: g * a, b: b * a, a };
}

/** Un-premultiply linear RGB by alpha (safe when a==0). */
export function unpremultiply(r: number, g: number, b: number, a: number) {
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const ia = 1 / a;
  return { r: r * ia, g: g * ia, b: b * ia, a };
}

/** sRGB 8-bit -> linear *premultiplied* RGBA (0..1) */
export function srgb8ToLinearPremul(
  r: number,
  g: number,
  b: number,
  a: number
) {
  const lin = srgb8ToLinear(r, g, b, a);
  return premultiply(lin.r, lin.g, lin.b, lin.a);
}

/** linear *premultiplied* RGBA (0..1) -> sRGB 8-bit */
export function linearPremulToSrgb8(
  rp: number,
  gp: number,
  bp: number,
  a: number
): { r: number; g: number; b: number; a: number } {
  // Convert premul -> non-premul in linear, then to sRGB8
  const { r, g, b } = unpremultiply(rp, gp, bp, a);
  return linearToSrgb8(r, g, b, a);
}

/** Utility: lerp two linear colors (non-premul). */
export function lerpRGBA(a: RGBA, b: RGBA, t: number): RGBA {
  const u = clamp01(t);
  return {
    r: a.r + (b.r - a.r) * u,
    g: a.g + (b.g - a.g) * u,
    b: a.b + (b.b - a.b) * u,
    a: a.a + (b.a - a.a) * u,
  };
}

/** Utility: set alpha on linear color (non-premul). */
export function withAlpha(c: RGBA, a: number): RGBA {
  return { r: c.r, g: c.g, b: c.b, a: clamp01(a) };
}
