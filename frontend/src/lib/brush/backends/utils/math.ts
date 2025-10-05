// FILE: src/lib/brush/backends/utils/math.ts
// Strict-safe scalar math helpers (no `any`). Superset of your previous helpers.

/** Clamp v to [min,max] */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
/** Clamp to [0,1] */
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
/** Linear interpolation */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
/** Alias for lerp (kept for compatibility) */
export const mix = lerp;

/** Inverse lerp (raw, unclamped): maps x in [a,b] -> t. Matches your old `(v-a)/(b-a||1)` */
export function invLerp(a: number, b: number, x: number): number {
  const denom = b - a;
  return denom === 0 ? 0 : (x - a) / denom;
}
/** Inverse lerp (clamped 0..1) */
export function invLerp01(a: number, b: number, x: number): number {
  return clamp01(invLerp(a, b, x));
}

/** Remap x from [inMin,inMax] to [outMin,outMax] (clamped) — matches your `remap(...)` */
export function remap(
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
  v: number
): number {
  return lerp(outMin, outMax, invLerp01(inMin, inMax, v));
}
/** Remap without clamping (sometimes handy) */
export function remapRaw(
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
  v: number
): number {
  return lerp(outMin, outMax, invLerp(inMin, inMax, v));
}

/** Smoothstep on [0,1] input — exactly your `smoothstep(t)` */
export function smoothstep01(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}
/** General smoothstep between edges */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  return smoothstep01(invLerp01(edge0, edge1, x));
}
/** Smootherstep on [0,1] */
export function smootherstep01(t: number): number {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
}
/** General smootherstep */
export function smootherstep(edge0: number, edge1: number, x: number): number {
  return smootherstep01(invLerp01(edge0, edge1, x));
}

/** Hypotenuse (alias kept for compatibility) */
export function hypot2(x: number, y: number): number {
  return Math.hypot(x, y);
}
/** Nearly-equal within epsilon */
export function nearlyEqual(
  a: number,
  b: number,
  eps = 1e-6
): number | boolean {
  return Math.abs(a - b) <= eps;
}

/** Degrees ↔ Radians */
export function deg2rad(d: number): number {
  return (d * Math.PI) / 180;
}
export function rad2deg(r: number): number {
  return (r * 180) / Math.PI;
}

/** Shortest-path interpolation between angles in degrees (keeps your signature) */
export function lerpAngleDeg(a: number, b: number, t: number): number {
  const d = ((b - a + 540) % 360) - 180;
  return a + d * clamp01(t);
}

/** Bias curve (k in (0,1) skews toward 0; k>1 toward 1) */
export function bias(t: number, k: number): number {
  if (k === 0.5) return t;
  const p = Math.log(k) / Math.log(0.5);
  return Math.pow(t, p);
}
/** Gain curve via mirrored bias */
export function gain(t: number, g: number): number {
  return t < 0.5 ? 0.5 * bias(t * 2, g) : 1 - 0.5 * bias((1 - t) * 2, g);
}

/** Radial falloffs (distance d, radius r) -> [0,1] */
export function falloffLinear(d: number, r: number): number {
  return clamp01(1 - d / Math.max(1e-12, r));
}
export function falloffSmooth(d: number, r: number): number {
  return smoothstep(r, 0, d);
}
export function falloffGaussian(d: number, sigma: number): number {
  const s2 = Math.max(1e-12, sigma * sigma);
  return Math.exp(-(d * d) / (2 * s2));
}

/** Area-preserving-ish width scaling from pressure (0..1) with a gentle curve */
export function pressureToWidthScale(pressure: number, k = 0.7): number {
  const t = clamp01(pressure);
  return mix(0.2, 1.0, Math.pow(t, k));
}
/** Flow scaling from pressure (0..1) with bias (softer at low pressure) */
export function pressureToFlowScale(pressure: number, k = 0.5): number {
  return bias(clamp01(pressure), k);
}
/** End-of-stroke taper: tEnd in [0,1] where 1 is the end; b controls strength */
export function applyEndBias(tEnd: number, b = 0.6): number {
  return clamp01(Math.pow(clamp01(tEnd), b));
}
