// src/lib/brush/backends/spray/core/core.ts
/** Small HSL jitter helper that returns an rgba() string */
export function jitterColorHSLA(
  base: string,
  jitter: { h?: number; s?: number; l?: number } | undefined,
  rand: () => number,
  alpha: number
): string {
  if (!jitter || (!jitter.h && !jitter.s && !jitter.l)) {
    return rgbaFromHex(base, alpha);
  }

  const { h, s, l } = parseHexToHSL(base);
  const hh = wrapHue(h + (jitter.h ?? 0) * (rand() * 2 - 1));
  const ss = clamp01(s + (jitter.s ?? 0) * (rand() * 2 - 1));
  const ll = clamp01(l + (jitter.l ?? 0) * (rand() * 2 - 1));
  const { r, g, b } = hslToRgb(hh, ss, ll);
  return `rgba(${r},${g},${b},${clamp01(alpha).toFixed(4)})`;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function wrapHue(h: number): number {
  // wrap to [0,360)
  const m = ((h % 360) + 360) % 360;
  return m;
}

function rgbaFromHex(hex: string, a: number): string {
  const { r, g, b } = hexToRgbSafe(hex);
  return `rgba(${r},${g},${b},${clamp01(a).toFixed(4)})`;
}

/** Robust hex parser. Accepts #RGB, #RRGGBB, #RGBA, #RRGGBBAA. Falls back to black on invalid. */
function hexToRgbSafe(hex: string): { r: number; g: number; b: number } {
  let h = (hex || "").trim();
  if (h.startsWith("#")) h = h.slice(1);

  // Must be 3, 4, 6, or 8 hex digits
  if (!/^[0-9a-fA-F]{3,4}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(h)) {
    return { r: 0, g: 0, b: 0 };
  }

  // #RGB / #RGBA
  if (h.length === 3 || h.length === 4) {
    const r = parseInt(h.charAt(0) + h.charAt(0), 16);
    const g = parseInt(h.charAt(1) + h.charAt(1), 16);
    const b = parseInt(h.charAt(2) + h.charAt(2), 16);
    // ignore alpha nibble h.charAt(3)
    return { r, g, b };
  }

  // #RRGGBB / #RRGGBBAA
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // ignore trailing AA if present
  return {
    r: Number.isFinite(r) ? r : 0,
    g: Number.isFinite(g) ? g : 0,
    b: Number.isFinite(b) ? b : 0,
  };
}

function parseHexToHSL(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgbSafe(hex);
  const rr = r / 255,
    gg = g / 255,
    bb = b / 255;
  const max = Math.max(rr, gg, bb),
    min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  let h = 0,
    s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rr:
        h = (gg - bb) / d + (gg < bb ? 6 : 0);
        break;
      case gg:
        h = (bb - rr) / d + 2;
        break;
      case bb:
        h = (rr - gg) / d + 4;
        break;
    }
    h *= 60;
  }
  return { h, s: clamp01(s), l: clamp01(l) };
}

function hslToRgb(
  h: number,
  s: number,
  l: number
): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let rr = 0,
    gg = 0,
    bb = 0;
  if (0 <= h && h < 60) {
    rr = c;
    gg = x;
    bb = 0;
  } else if (60 <= h && h < 120) {
    rr = x;
    gg = c;
    bb = 0;
  } else if (120 <= h && h < 180) {
    rr = 0;
    gg = c;
    bb = x;
  } else if (180 <= h && h < 240) {
    rr = 0;
    gg = x;
    bb = c;
  } else if (240 <= h && h < 300) {
    rr = x;
    gg = 0;
    bb = c;
  } else {
    rr = c;
    gg = 0;
    bb = x;
  }

  return {
    r: Math.round((rr + m) * 255),
    g: Math.round((gg + m) * 255),
    b: Math.round((bb + m) * 255),
  };
}
