// FILE: src/lib/brush/backends/stamping/utils/color.ts
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;

const toByte = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

export function rgbaFromHex(hex: string | undefined, alpha = 1): string {
  const a = clamp01(alpha);
  if (!hex) return `rgba(0,0,0,${a})`;
  const m = hex.replace("#", "");
  if (m.length === 3) {
    const r = toByte(parseInt(m[0]! + m[0]!, 16));
    const g = toByte(parseInt(m[1]! + m[1]!, 16));
    const b = toByte(parseInt(m[2]! + m[2]!, 16));
    return `rgba(${r},${g},${b},${a})`;
  }
  const r = toByte(parseInt(m.slice(0, 2), 16));
  const g = toByte(parseInt(m.slice(2, 4), 16));
  const b = toByte(parseInt(m.slice(4, 6), 16));
  return `rgba(${r},${g},${b},${a})`;
}
