// FILE: src/lib/brush/backends/utils/color.ts
// Strict-safe color helpers for all backends (no `any`).
// - RGBA helpers (0..1 floats), CSS conversions
// - Hex parsing (#RGB/#RGBA/#RRGGBB/#RRGGBBAA)
// - sRGB ↔ linear conversions, luminance
// - Legacy stamping API: rgbaFromHex(hex?: string, alpha=1) -> css rgba(...)
// - Color jitter in HSLA space with RNG (uniform/gaussian), legacy/new shapes
// - Extra: premultiply/unpremultiply helpers

import type { RGBA } from "@/lib/brush/core/types";
import { clamp01, lerp } from "@backends/utils/math";
import type { RNG } from "@backends/utils/random";

// Re-export so callers can import clamp01 from color if they prefer:
export { clamp01 } from "@backends/utils/math";

/* ============================= Core RGBA ============================= */

export function rgba(r: number, g: number, b: number, a = 1): RGBA {
  return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: clamp01(a) };
}

function toByte01(x: number): number {
  const v = Math.round(clamp01(x) * 255);
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

export function toCss(c: RGBA): string {
  return `rgba(${toByte01(c.r)},${toByte01(c.g)},${toByte01(c.b)},${clamp01(
    c.a
  )})`;
}

export function clampColor(c: RGBA): RGBA {
  return rgba(c.r, c.g, c.b, c.a);
}

/* ============================== HEX I/O ============================== */
/* Use charAt() instead of [i] so it's strict-safe with noUncheckedIndexedAccess. */

function parseByte2(s: string, i: number): number {
  const hi = s.charAt(i);
  const lo = s.charAt(i + 1);
  const val = parseInt(hi + lo, 16);
  return Number.isFinite(val) ? val : 0;
}

function parseByte1Dup(s: string, i: number): number {
  const ch = s.charAt(i);
  const val = parseInt(ch + ch, 16);
  return Number.isFinite(val) ? val : 0;
}

/** Parse #RGB/#RRGGBB into RGBA (0..1). Throws on invalid. */
export function fromHex(hex: string): RGBA {
  const s = hex.trim();
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) {
    throw new Error(`Invalid hex color (expected #RGB or #RRGGBB): ${hex}`);
  }
  const h = s.slice(1);
  let r: number, g: number, b: number;
  if (h.length === 3) {
    r = parseByte1Dup(h, 0);
    g = parseByte1Dup(h, 1);
    b = parseByte1Dup(h, 2);
  } else {
    r = parseByte2(h, 0);
    g = parseByte2(h, 2);
    b = parseByte2(h, 4);
  }
  return { r: r / 255, g: g / 255, b: b / 255, a: 1 };
}

/** RGBA -> #RRGGBB (or #RRGGBBAA if includeAlpha=true) */
export function toHex(c: RGBA, includeAlpha = false): string {
  const r = toByte01(c.r).toString(16).padStart(2, "0");
  const g = toByte01(c.g).toString(16).padStart(2, "0");
  const b = toByte01(c.b).toString(16).padStart(2, "0");
  if (!includeAlpha) return `#${r}${g}${b}`;
  const a = toByte01(c.a).toString(16).padStart(2, "0");
  return `#${r}${g}${b}${a}`;
}

/* ===== Legacy stamping API: keep exact behavior of old rgbaFromHex ===== */
/**
 * - Accepts #RGB or #RRGGBB; if hex is falsy, returns black with given alpha.
 * - Ignores hex alpha even if present; alpha parameter is used as-is.
 */
export function rgbaFromHex(hex: string | undefined, alpha = 1): string {
  const a = clamp01(alpha);
  if (!hex) return `rgba(0,0,0,${a})`;

  const m = hex.startsWith("#") ? hex.slice(1) : hex;
  let r: number, g: number, b: number;

  if (m.length === 3) {
    r = parseByte1Dup(m, 0);
    g = parseByte1Dup(m, 1);
    b = parseByte1Dup(m, 2);
  } else {
    // take first 6 characters; extra chars ignored to preserve legacy behavior
    r = parseByte2(m, 0);
    g = parseByte2(m, 2);
    b = parseByte2(m, 4);
  }
  return `rgba(${r},${g},${b},${a})`;
}

/**
 * Extended variant: honors #RGBA / #RRGGBBAA.
 * Final alpha = hexAlpha * alphaArg (both clamped).
 */
export function rgbaFromHexAutoAlpha(hex: string, alpha = 1): string {
  const s = hex.trim();
  const aArg = clamp01(alpha);
  if (!/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6,8})$/.test(s)) {
    return `rgba(0,0,0,${aArg})`;
  }
  const h = s.slice(1);
  let r = 0,
    g = 0,
    b = 0,
    a = 255;

  if (h.length === 3 || h.length === 4) {
    r = parseByte1Dup(h, 0);
    g = parseByte1Dup(h, 1);
    b = parseByte1Dup(h, 2);
    if (h.length === 4) a = parseByte1Dup(h, 3);
  } else {
    r = parseByte2(h, 0);
    g = parseByte2(h, 2);
    b = parseByte2(h, 4);
    if (h.length === 8) a = parseByte2(h, 6);
  }

  const oa = clamp01((a / 255) * aArg);
  return `rgba(${r},${g},${b},${oa})`;
}

/* =========================== Color operations =========================== */

export function mix(c1: RGBA, c2: RGBA, t: number): RGBA {
  const u = clamp01(t);
  return rgba(
    lerp(c1.r, c2.r, u),
    lerp(c1.g, c2.g, u),
    lerp(c1.b, c2.b, u),
    lerp(c1.a, c2.a, u)
  );
}

/* sRGB <-> linear (component-wise) */
export function srgbToLinear1(x: number): number {
  const v = clamp01(x);
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
export function linearToSrgb1(x: number): number {
  const v = Math.max(0, x);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}
export function srgbToLinear(c: RGBA): RGBA {
  return rgba(srgbToLinear1(c.r), srgbToLinear1(c.g), srgbToLinear1(c.b), c.a);
}
export function linearToSrgb(c: RGBA): RGBA {
  return rgba(linearToSrgb1(c.r), linearToSrgb1(c.g), linearToSrgb1(c.b), c.a);
}

/** Relative luminance (sRGB, WCAG) */
export function luminance(c: RGBA): number {
  const L = srgbToLinear(c);
  return 0.2126 * L.r + 0.7152 * L.g + 0.0722 * L.b;
}

/* =========================== HSL ↔ RGB helpers =========================== */

export function rgb01_to_hsl({ r, g, b, a }: RGBA): {
  h: number;
  s: number;
  l: number;
  a: number;
} {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0,
    s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60; // degrees
  }
  return { h, s, l, a };
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

export function hsl_to_rgb01(h: number, s: number, l: number, a: number): RGBA {
  const hh = ((h % 360) + 360) % 360; // normalize hue to [0,360)
  const H = hh / 360;
  if (s === 0) {
    const v = clamp01(l);
    return { r: v, g: v, b: v, a: clamp01(a) };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgb(p, q, H + 1 / 3);
  const g = hue2rgb(p, q, H);
  const b = hue2rgb(p, q, H - 1 / 3);
  return { r: clamp01(r), g: clamp01(g), b: clamp01(b), a: clamp01(a) };
}

/* ====================== Color jitter (HSLA + RNG) ====================== */

export type ColorJitter = {
  /** +/- degrees of hue jitter (uniform if gaussian=false; sigma≈deg/2 if gaussian=true) */
  hueDeg?: number;
  /** +/- saturation jitter in 0..1 */
  sat?: number;
  /** +/- lightness jitter in 0..1 */
  light?: number;
  /** +/- alpha jitter in 0..1 */
  alpha?: number;
  /** Use Gaussian (normal) jitter instead of uniform? */
  gaussian?: boolean;
  /** If true, hue wraps 0..360; if false, clamp (default: true) */
  wrapHue?: boolean;
};

// Legacy shape (your existing cj)
export type LegacyColorJitter = {
  h?: number; // degrees
  s?: number; // +/- in [0,1]
  l?: number; // +/- in [0,1]
  a?: number; // +/- in [0,1]
  gaussian?: boolean;
  wrapHue?: boolean;
  perDroplet?: boolean; // ignored here
};

type ColorJitterLike = ColorJitter | LegacyColorJitter;

function normalizeJitter(j?: ColorJitterLike): Required<ColorJitter> {
  if (!j) {
    return {
      hueDeg: 0,
      sat: 0,
      light: 0,
      alpha: 0,
      gaussian: false,
      wrapHue: true,
    };
  }
  const hueDeg =
    ("hueDeg" in j ? j.hueDeg : undefined) ?? ("h" in j ? j.h : undefined) ?? 0;
  const sat =
    ("sat" in j ? j.sat : undefined) ?? ("s" in j ? j.s : undefined) ?? 0;
  const light =
    ("light" in j ? j.light : undefined) ?? ("l" in j ? j.l : undefined) ?? 0;
  const alpha =
    ("alpha" in j ? j.alpha : undefined) ?? ("a" in j ? j.a : undefined) ?? 0;
  const gaussian =
    "gaussian" in j && typeof j.gaussian === "boolean" ? j.gaussian : false;
  const wrapHue =
    "wrapHue" in j && typeof j.wrapHue === "boolean" ? j.wrapHue : true;
  return { hueDeg, sat, light, alpha, gaussian, wrapHue };
}

/**
 * Jitter a base color in HSLA space and return a CSS rgba string.
 * - `base`: hex (#RGB/#RGBA/#RRGGBB/#RRGGBBAA) or RGBA object
 * - `jit`: legacy or new jitter shape
 * - `rng`: canonical RNG
 * - `alphaOverride`: if provided, multiplies into final alpha
 */
export function jitterColorHSLA(
  base: string | RGBA,
  jit: ColorJitterLike | undefined,
  rng: RNG,
  alphaOverride?: number
): string {
  const c = coerceToRGBA(base);
  const J = normalizeJitter(jit);

  const { h: baseH, s: baseS, l: baseL, a: baseA } = rgb01_to_hsl(c);
  const useGauss = J.gaussian;
  const delta = (span = 0) =>
    useGauss ? rng.normal(0, span / 2) : rng.range(-span, span);

  const hDelta = J.hueDeg ? delta(J.hueDeg) : 0;
  const sDelta = J.sat ? delta(J.sat) : 0;
  const lDelta = J.light ? delta(J.light) : 0;
  const aDelta = J.alpha ? delta(J.alpha) : 0;

  let h = baseH + hDelta;
  if (J.wrapHue) h = ((h % 360) + 360) % 360;
  else h = Math.max(0, Math.min(360, h));
  const s = clamp01(baseS + sDelta);
  const l = clamp01(baseL + lDelta);
  const a = clamp01(
    (baseA + aDelta) * (alphaOverride != null ? clamp01(alphaOverride) : 1)
  );

  const out = hsl_to_rgb01(h, s, l, a);
  return toCss(out);
}

/* ============================ Premultiply helpers ============================ */

export function premultiply(c: RGBA): RGBA {
  const a = clamp01(c.a);
  return { r: c.r * a, g: c.g * a, b: c.b * a, a };
}

export function unpremultiply(c: RGBA): RGBA {
  const a = clamp01(c.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return { r: c.r / a, g: c.g / a, b: c.b / a, a };
}

/* ========================== Input coercion ========================== */

function parseHexAnyToRGBA(hex: string): RGBA {
  const s = hex.trim();
  if (!s.startsWith("#")) throw new Error("hex must start with #");
  const h = s.slice(1);

  let r = 0,
    g = 0,
    b = 0,
    a = 255;
  if (h.length === 3 || h.length === 4) {
    r = parseByte1Dup(h, 0);
    g = parseByte1Dup(h, 1);
    b = parseByte1Dup(h, 2);
    if (h.length === 4) a = parseByte1Dup(h, 3);
  } else if (h.length === 6 || h.length === 8) {
    r = parseByte2(h, 0);
    g = parseByte2(h, 2);
    b = parseByte2(h, 4);
    if (h.length === 8) a = parseByte2(h, 6);
  } else {
    throw new Error(`Invalid hex length: #${h}`);
  }
  return { r: r / 255, g: g / 255, b: b / 255, a: a / 255 };
}

function coerceToRGBA(color: string | RGBA): RGBA {
  if (typeof color !== "string") return color;
  const s = color.trim();
  if (s.startsWith("#")) return parseHexAnyToRGBA(s);
  // If you need rgb()/rgba() parsing later, add here; for now, fallback to black.
  return { r: 0, g: 0, b: 0, a: 1 };
}
