// FILE: src/lib/brush/backends/pattern/core/color.ts

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function hexToRgbSafe(hex: string): { r: number; g: number; b: number } {
  let h = (hex || "").trim();
  if (h.startsWith("#")) h = h.slice(1);
  if (h.length === 3) {
    const r = parseInt(h[0]! + h[0]!, 16) || 0;
    const g = parseInt(h[1]! + h[1]!, 16) || 0;
    const b = parseInt(h[2]! + h[2]!, 16) || 0;
    return { r, g, b };
  }
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return { r, g, b };
}

export function rgbaFromHex(hex: string, a: number): string {
  const { r, g, b } = hexToRgbSafe(hex);
  return `rgba(${r},${g},${b},${clamp01(a).toFixed(4)})`;
}
