// Scalar math (no vector types here)
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) =>
  (v - a) / (b - a || 1);
export const remap = (
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
  v: number
) => lerp(outMin, outMax, clamp01(invLerp(inMin, inMax, v)));
export const smoothstep = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
export const mix = lerp;
export const hypot2 = (x: number, y: number) => Math.hypot(x, y);
export const nearlyEqual = (a: number, b: number, eps = 1e-6) =>
  Math.abs(a - b) <= eps;

// Angles (degrees)
export const deg2rad = (d: number) => (d * Math.PI) / 180;
export const rad2deg = (r: number) => (r * 180) / Math.PI;
/** Shortest-path interpolation between angles in degrees. */
export function lerpAngleDeg(a: number, b: number, t: number) {
  const d = ((b - a + 540) % 360) - 180;
  return a + d * clamp01(t);
}
