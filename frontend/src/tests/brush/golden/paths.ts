// FILE: tests/brush/golden/paths.ts
/**
 * Canonical test paths for golden-image baselines.
 * - Slow S-curve (even tempo)
 * - Fast flick (acceleration → deceleration)
 * - Heavy press ramp (pressure 0.1 → 1.0)
 * - Shallow tilt sweep (tilt 0 → ~0.7)
 *
 * All paths include:
 *   - x, y (CSS px)
 *   - t (ms since path start; synthetic but monotonic)
 *   - p and pressure (duplicated for engine/test adapters)
 *   - angle (deg) approximate local tangent
 *   - tilt (0..1) when relevant
 */

export type TestPathPoint = {
  x: number;
  y: number;
  t: number; // ms from start
  p: number; // shorthand pressure
  pressure: number; // explicit pressure (duplicate of p)
  angle?: number; // degrees (approx tangent)
  tilt?: number; // 0..1
};

export type CanonicalPath = ReadonlyArray<TestPathPoint>;

/* ------------------------------- Utilities ------------------------------- */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Safe array index read (avoids undefined under noUncheckedIndexedAccess). */
function at(arr: number[], i: number, fallback = 0): number {
  const v = arr[i];
  return typeof v === "number" ? v : fallback;
}

/** Compute an approximate tangent angle in degrees for polyline samples (safe). */
function tangentDeg(xs: number[], ys: number[], i: number): number {
  const im1 = Math.max(0, i - 1);
  const ip1 = Math.min(xs.length - 1, i + 1);
  const dx = at(xs, ip1, at(xs, xs.length - 1, 0)) - at(xs, im1, at(xs, 0, 0));
  const dy = at(ys, ip1, at(ys, ys.length - 1, 0)) - at(ys, im1, at(ys, 0, 0));
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** Build TestPathPoint[] from component arrays with synthetic timestamps (safe). */
function buildPath(
  xs: number[],
  ys: number[],
  dtMs: (i: number) => number, // delta time between samples
  pAt: (i: number) => number, // pressure 0..1
  tiltAt?: (i: number) => number
): CanonicalPath {
  const out: TestPathPoint[] = [];
  let t = 0;
  const n = Math.min(xs.length, ys.length);
  for (let i = 0; i < n; i++) {
    if (i > 0) t += Math.max(0, Math.round(dtMs(i)));
    const p = clamp01(pAt(i));
    const angle = tangentDeg(xs, ys, i);
    const tilt = tiltAt ? clamp01(tiltAt(i)) : undefined;
    out.push({
      x: at(xs, i, 0),
      y: at(ys, i, 0),
      t,
      p,
      pressure: p,
      angle,
      ...(tilt !== undefined ? { tilt } : {}),
    });
  }
  return out;
}

/** Convenience: make a linear range inclusive of both ends. */
function linspace(a: number, b: number, n: number): number[] {
  if (n <= 1) return [a];
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    out[i] = a + (b - a) * (i / (n - 1));
  }
  return out;
}

/* ------------------------------ Canonical Paths ------------------------------ */

/**
 * Slow S-curve across a 320×120 cell.
 * Even timing, moderate curvature, medium pressure (0.4→0.7).
 */
export const PATH_SLOW_CURVE: CanonicalPath = (() => {
  const W = 320;
  const H = 120;
  const N = 64;

  const xs = linspace(12, W - 12, N);
  const ys = xs.map((x, i) => {
    const t = i / (N - 1);
    const midY = H * 0.55;
    const amp = H * 0.22;
    // gentle S
    return midY - amp * (t - 0.5) + amp * 0.28 * Math.sin(5 * t);
  });

  const dtMs = () => 8; // ~125 Hz, slow/steady
  const pAt = (i: number) => 0.4 + 0.3 * (i / (N - 1));
  return buildPath(xs, ys, dtMs, pAt);
})();

/**
 * Fast flick: short travel, highly uneven timing (accelerate then release).
 * Pressure starts higher and eases off.
 */
export const PATH_FAST_FLICK: CanonicalPath = (() => {
  const N = 28;
  const x0 = 40;
  const y0 = 64;

  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1); // 0..1
    // quick curve to the right & slightly up
    const r = 90 * (1 - Math.pow(1 - t, 2)); // ease-out distance
    const theta = (-10 + 25 * t) * (Math.PI / 180); // slight arc
    xs.push(x0 + r * Math.cos(theta));
    ys.push(y0 + r * Math.sin(theta));
  }

  // Accelerate (small dt) then decelerate (larger dt)
  const dtMs = (i: number) => {
    const t = i / (N - 1);
    return Math.round(2 + 7 * Math.pow(t, 1.8)); // 2..9 ms
  };
  // Pressure fades: 0.85 → 0.45
  const pAt = (i: number) => 0.85 - 0.4 * (i / (N - 1));
  return buildPath(xs, ys, dtMs, pAt);
})();

/**
 * Heavy press ramp on a straight stroke: pressure 0.1 → 1.0.
 * Even timing; good to assert pressure→width/flow mapping.
 */
export const PATH_PRESSURE_RAMP: CanonicalPath = (() => {
  const N = 48;
  const xs = linspace(24, 24 + 260, N);
  const ys = new Array(N).fill(84);

  const dtMs = () => 6; // ~166 Hz
  const pAt = (i: number) => 0.1 + 0.9 * (i / (N - 1));
  return buildPath(xs, ys, dtMs, pAt);
})();

/**
 * Shallow tilt sweep on a gentle curve: tilt 0.0 → ~0.7.
 * Useful for verifying tilt→fan/size/grain routing.
 */
export const PATH_TILT_SWEEP: CanonicalPath = (() => {
  const W = 320;
  const H = 120;
  const N = 56;

  const xs = linspace(16, W - 24, N);
  const ys = xs.map((x, i) => {
    const t = i / (N - 1);
    const midY = H * 0.5;
    const amp = H * 0.18;
    return midY + amp * Math.sin(2.4 * Math.PI * t + 0.2);
  });

  const dtMs = () => 7;
  const pAt = () => 0.6; // keep pressure stable
  const tiltAt = (i: number) => 0.0 + 0.7 * (i / (N - 1));
  return buildPath(xs, ys, dtMs, pAt, tiltAt);
})();

/* ----------------------------- Aggregated Export ----------------------------- */

export const CANONICAL_PATHS = {
  slowCurve: PATH_SLOW_CURVE,
  fastFlick: PATH_FAST_FLICK,
  pressureRamp: PATH_PRESSURE_RAMP,
  tiltSweep: PATH_TILT_SWEEP,
} as const;

export type CanonicalPathName = keyof typeof CANONICAL_PATHS;
