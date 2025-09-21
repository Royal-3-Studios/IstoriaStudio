// src/lib/brush/backends/utils/curves.ts
import type { CurvePoint } from "@/lib/brush/core/types";

/* ============================================================
   EASINGS
   ============================================================ */
export const Easing = {
  linear: (t: number) => t,
  easeIn: (t: number) => t * t,
  easeOut: (t: number) => 1 - (1 - t) * (1 - t),
  easeInOut: (t: number) =>
    t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  expo: (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, 10 * (t - 1))),
} as const;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* ============================================================
   SANITIZE POINTS (sorted, de-duped, clamped)
   - forces x,y into [0,1]
   - sorts by x
   - removes duplicate x within EPS
   - guarantees first.x=0 and last.x=1 (by inserting if missing)
   ============================================================ */
const EPS = 1e-6;
function sanitize(points: CurvePoint[]): CurvePoint[] {
  if (!points || points.length === 0)
    return [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
  const pts = points
    .map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }))
    .sort((a, b) => a.x - b.x);

  const out: CurvePoint[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (i === 0 || Math.abs(pts[i].x - pts[i - 1].x) > EPS) out.push(pts[i]);
    else out[out.length - 1] = pts[i]; // keep the last for identical x
  }
  if (out[0].x > EPS) out.unshift({ x: 0, y: out[0].y }); // extend to x=0
  if (1 - out[out.length - 1].x > EPS)
    out.push({ x: 1, y: out[out.length - 1].y }); // extend to x=1
  return out;
}

/* ============================================================
   MONOTONE CUBIC HERMITE (Fritsch–Carlson)
   - preserves monotonicity; avoids overshoot
   - perfect for pressure/size/taper curves
   ============================================================ */
type Segment = {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  m0: number;
  m1: number;
};

function buildMonotoneSegments(points: CurvePoint[]): Segment[] {
  const pts = sanitize(points);
  const n = pts.length;
  const dx = new Array(n - 1);
  const dy = new Array(n - 1);
  const slope = new Array(n - 1);

  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x;
    dy[i] = pts[i + 1].y - pts[i].y;
    slope[i] = dy[i] / (dx[i] || EPS);
  }

  const m = new Array(n).fill(0);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) m[i] = 0;
    else m[i] = (slope[i - 1] + slope[i]) / 2;
  }

  // Fritsch–Carlson limiter
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      const t = 3 / h;
      m[i] = a * t * slope[i];
      m[i + 1] = b * t * slope[i];
    }
  }

  const segs: Segment[] = [];
  for (let i = 0; i < n - 1; i++) {
    segs.push({
      x0: pts[i].x,
      x1: pts[i + 1].x,
      y0: pts[i].y,
      y1: pts[i + 1].y,
      m0: m[i],
      m1: m[i + 1],
    });
  }
  return segs;
}

function evalMonotone(segs: Segment[], x: number): number {
  const X = clamp01(x);
  // binary search segment
  let lo = 0,
    hi = segs.length - 1,
    mid = 0;
  while (lo <= hi) {
    mid = (lo + hi) >>> 1;
    const s = segs[mid];
    if (X < s.x0) hi = mid - 1;
    else if (X > s.x1) lo = mid + 1;
    else break;
  }
  const s = segs[mid];
  const h = s.x1 - s.x0 || EPS;
  const t = (X - s.x0) / h;
  // Hermite basis
  const t2 = t * t,
    t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  const y = h00 * s.y0 + h10 * h * s.m0 + h01 * s.y1 + h11 * h * s.m1;
  return clamp01(y);
}

/* ============================================================
   CUBIC BÉZIER SUPPORT (optional; assumes x is monotonic)
   - useful for classic UI bezier handles (0,0)-(c1)-(c2)-(1,1)
   ============================================================ */
export function cubicBezierLUT(
  c1: CurvePoint,
  c2: CurvePoint,
  n = 256
): Float32Array {
  // assume endpoints are (0,0) and (1,1), and x is monotonic
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    // invert x(t) with Newton iterations
    let t = x,
      it = 0;
    for (; it < 6; it++) {
      const xt = bezier1d(t, 0, c1.x, c2.x, 1);
      const dxt = bezier1dPrime(t, 0, c1.x, c2.x, 1);
      if (dxt === 0) break;
      t -= (xt - x) / dxt;
      if (t <= 0) {
        t = 0;
        break;
      }
      if (t >= 1) {
        t = 1;
        break;
      }
    }
    out[i] = clamp01(bezier1d(t, 0, c1.y, c2.y, 1));
  }
  return out;
}

function bezier1d(t: number, p0: number, p1: number, p2: number, p3: number) {
  const u = 1 - t;
  return (
    u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
  );
}
function bezier1dPrime(
  t: number,
  p0: number,
  p1: number,
  p2: number,
  p3: number
) {
  const u = 1 - t;
  return 3 * u * u * (p1 - p0) + 6 * u * t * (p2 - p1) + 3 * t * t * (p3 - p2);
}

/* ============================================================
   LUT BUILD + SAMPLE (PUBLIC API)
   - buildLUT(): uses monotone cubic by default for user-supplied points
   - sampleLUT(): bilinear sample
   ============================================================ */
const CACHE = new Map<string, Float32Array>();

function keyFor(points: CurvePoint[], n: number): string {
  // stringify with small rounding to improve cache hits
  const s = sanitize(points)
    .map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`)
    .join("|");
  return `${n}:${s}`;
}

/** Build a LUT from control points using monotone cubic interpolation. */
export function buildLUT(points: CurvePoint[], n = 256): Float32Array {
  if (!points || points.length < 2) return new Float32Array([0, 1]);

  const key = keyFor(points, n);
  const cached = CACHE.get(key);
  if (cached) return cached;

  const segs = buildMonotoneSegments(points);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    out[i] = evalMonotone(segs, x);
  }
  CACHE.set(key, out);
  return out;
}

/** Sample a LUT with linear interpolation. */
export function sampleLUT(lut: Float32Array, t: number): number {
  if (!lut || lut.length < 2) return clamp01(t);
  const x = clamp01(t) * (lut.length - 1);
  const i = Math.floor(x),
    f = x - i;
  const a = lut[i],
    b = lut[i + 1] ?? a;
  return a + (b - a) * f;
}
