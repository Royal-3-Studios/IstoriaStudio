// FILE: src/lib/brush/curves/index.ts

export type CurvePoint = { x: number; y: number };
export type CurveLUT = number[] | Float32Array;
/** Unified “curve source”: either editable points or a baked LUT */
export type CurveSource = readonly CurvePoint[] | Float32Array;

/* --------------------------- small math helpers --------------------------- */
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* -------------------- piecewise-linear point curve API -------------------- */
/** Safe evaluation of a curve defined by [0..1] × [0..1] points. */
export function evaluateCurve(
  points: readonly CurvePoint[],
  x: number
): number {
  if (!points || points.length < 2) return clamp01(x);
  const t = clamp01(x);
  const n = points.length;

  // Fast-path: clamp to ends
  if (t <= points[0]!.x) return clamp01(points[0]!.y);
  if (t >= points[n - 1]!.x) return clamp01(points[n - 1]!.y);

  for (let i = 1; i < n; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (t <= b.x) {
      const denom = Math.max(1e-6, b.x - a.x);
      const k = (t - a.x) / denom;
      return clamp01(lerp(a.y, b.y, k));
    }
  }
  return clamp01(points[n - 1]!.y);
}

/** Built-in defaults you can swap in presets. */
export const DefaultCurves = {
  linear: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
  easeIn: [
    { x: 0, y: 0 },
    { x: 0.5, y: 0.2 },
    { x: 1, y: 1 },
  ],
  easeOut: [
    { x: 0, y: 0 },
    { x: 0.5, y: 0.8 },
    { x: 1, y: 1 },
  ],
  easeInOut: [
    { x: 0, y: 0 },
    { x: 0.25, y: 0.1 },
    { x: 0.75, y: 0.9 },
    { x: 1, y: 1 },
  ],
} as const;

/** Convenience evaluators (backwards compatible) */
export const pressureToWidth = (p: number, c?: readonly CurvePoint[]) =>
  evaluateCurve(c ?? DefaultCurves.linear, clamp01(p));
export const pressureToFlow = (p: number, c?: readonly CurvePoint[]) =>
  evaluateCurve(c ?? DefaultCurves.easeOut, clamp01(p));
export const speedToFlow = (s: number, c?: readonly CurvePoint[]) =>
  evaluateCurve(c ?? DefaultCurves.easeInOut, clamp01(s));

/* ----------------------------- LUT-based API ------------------------------ */
/**
 * Sample a 0..1 → 0..1 curve LUT (Float32Array or number[]) with linear interpolation.
 * Useful when you’ve prebuilt a Float32Array for hot paths.
 */
export function sampleCurveLUT(
  curve: CurveLUT | undefined,
  t: number,
  fallback = 1
): number {
  if (!curve || curve.length === 0) return clamp01(fallback);
  const n = curve.length;
  if (n === 1) return clamp01(curve[0]!);
  const x = clamp01(t) * (n - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = clamp01(curve[i]!);
  const b = clamp01(curve[i + 1 < n ? i + 1 : n - 1]!);
  return a + (b - a) * f;
}

/** Backward-compatible alias (some code may import `sampleCurve`) */
export const sampleCurve = sampleCurveLUT;

/** Optional: bake a point-curve into a LUT for hot sampling paths. */
export function bakePointsToLUT(
  points: readonly CurvePoint[],
  n = 256
): Float32Array {
  const out = new Float32Array(Math.max(2, n | 0));
  for (let i = 0; i < out.length; i++) {
    out[i] = evaluateCurve(points, i / (out.length - 1));
  }
  return out;
}

/* ---------------------- Unified point-or-LUT sampler ---------------------- */
/**
 * Sample from either a point-curve or a LUT. Falls back to `fallback` if missing.
 * Use this in backends so presets can provide points *or* baked LUTs.
 */
export function sampleCurveAny(
  src: CurveSource | undefined,
  t: number,
  fallback = t
): number {
  if (!src) return clamp01(fallback);
  const x = clamp01(t);

  // Fast path: LUT (Float32Array)
  if (src instanceof Float32Array) {
    return sampleCurveLUT(src, x, clamp01(fallback));
  }

  // Point curve
  return evaluateCurve(src, x);
}

/* ------------------------------ LUT builders ------------------------------ */
/** Build a gamma LUT (quick “curve” without control points). */
export function makeGammaLUT(gamma = 1, n = 256): Float32Array {
  const out = new Float32Array(Math.max(2, n | 0));
  const g = Math.max(1e-6, gamma);
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.pow(i / (out.length - 1), g);
  }
  return out;
}

/** Build a cubic-bezier LUT from two control points (0..1 space). */
export function makeCubicBezierLUT(
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  n = 256
): Float32Array {
  const out = new Float32Array(Math.max(2, n | 0));
  for (let i = 0; i < out.length; i++) {
    const x = i / (out.length - 1);
    // invert x(t) via Newton–Raphson
    let t = x;
    for (let it = 0; it < 6; it++) {
      const xt = bez1d(t, 0, c1x, c2x, 1);
      const dxt = bez1dPrime(t, 0, c1x, c2x, 1);
      if (Math.abs(dxt) < 1e-6) break;
      t = clamp01(t - (xt - x) / dxt);
    }
    out[i] = clamp01(bez1d(t, 0, c1y, c2y, 1));
  }
  return out;
}

/* ----------------------------- bezier internals --------------------------- */
function bez1d(t: number, p0: number, p1: number, p2: number, p3: number) {
  const u = 1 - t;
  return (
    u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
  );
}
function bez1dPrime(t: number, p0: number, p1: number, p2: number, p3: number) {
  const u = 1 - t;
  return 3 * u * u * (p1 - p0) + 6 * u * t * (p2 - p1) + 3 * t * t * (p3 - p2);
}
