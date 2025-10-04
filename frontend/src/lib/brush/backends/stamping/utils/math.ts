// FILE: src/lib/brush/backends/utils/math.ts
// Strict, zero-`any` math helpers used across backends.
// FILE: src/lib/brush/backends/stamping/utils/math.ts
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function mix(a: number, b: number, t: number): number {
  return lerp(a, b, t);
}
