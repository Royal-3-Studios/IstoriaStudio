// FILE: src/lib/brush/backends/utils/curves.ts
import type { CurvePoint } from "@/lib/brush/core/types";
import { atOrThrow } from "@/lib/brush/core/guards";

/* ============================ EASINGS ============================ */
export const Easing = {
  linear: (t: number) => t,
  easeIn: (t: number) => t * t,
  easeOut: (t: number) => 1 - (1 - t) * (1 - t),
  easeInOut: (t: number) =>
    t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  expo: (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, 10 * (t - 1))),
} as const;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const EPS = 1e-6;

/* ---------- safe helpers for arrays ---------- */

// For typed arrays (Float32Array / Float64Array) — bracket indexing is always number.
function tAt<T extends Float32Array | Float64Array>(ta: T, i: number): number {
  const n = ta.length;
  if (n === 0) return 0; // safe default
  let idx = i | 0; // to int
  if (idx < 0) idx = 0;
  if (idx > n - 1) idx = n - 1;
  return ta[idx]!; // index is clamped → definitely number
}

/* ========================= SANITIZE POINTS ======================= */
function sanitize(points: ReadonlyArray<CurvePoint>): CurvePoint[] {
  const base =
    points && points.length > 0
      ? points
      : ([
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ] satisfies CurvePoint[]);

  const pts = base
    .map((p) => ({ x: clamp01(p.x), y: clamp01(p.y) }))
    .sort((a, b) => a.x - b.x);

  const out: CurvePoint[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (i === 0) {
      out.push(atOrThrow(pts, 0));
    } else {
      const prev = atOrThrow(pts, i - 1);
      const cur = atOrThrow(pts, i);
      if (Math.abs(cur.x - prev.x) > EPS) out.push(cur);
      else {
        if (out.length === 0) out.push(cur);
        else out[out.length - 1] = cur; // keep last for duplicate x
      }
    }
  }

  if (out.length === 0) out.push({ x: 0, y: 0 }, { x: 1, y: 1 });

  const first = atOrThrow(out, 0);
  if (first.x > EPS) out.unshift({ x: 0, y: first.y });

  const last = atOrThrow(out, out.length - 1);
  if (1 - last.x > EPS) out.push({ x: 1, y: last.y });

  return out;
}

/* ============== MONOTONE CUBIC HERMITE (Fritsch–Carlson) ============== */
type Segment = {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  m0: number;
  m1: number;
};

function buildMonotoneSegments(points: ReadonlyArray<CurvePoint>): Segment[] {
  const pts = sanitize(points);
  const n = pts.length;

  if (n === 1) {
    const p = atOrThrow(pts, 0);
    return [{ x0: 0, x1: 1, y0: p.y, y1: p.y, m0: 0, m1: 0 }];
  }

  // Typed arrays => elements are always number (never undefined)
  const dx = new Float64Array(n - 1);
  const dy = new Float64Array(n - 1);
  const slope = new Float64Array(n - 1);

  for (let i = 0; i < n - 1; i++) {
    const a = atOrThrow(pts, i);
    const b = atOrThrow(pts, i + 1);
    dx[i] = b.x - a.x;
    dy[i] = b.y - a.y;
    {
      const dx_i = tAt(dx, i);
      const dy_i = tAt(dy, i);
      slope[i] = dy_i / (dx_i || EPS);
    }
  }

  // Tangent estimates at each knot (typed array => numbers)
  const m = new Float64Array(n);
  m[0] = tAt(slope, 0);
  m[n - 1] = tAt(slope, n - 2);

  for (let i = 1; i < n - 1; i++) {
    const s0 = tAt(slope, i - 1);
    const s1 = tAt(slope, i);
    m[i] = s0 * s1 <= 0 ? 0 : (s0 + s1) / 2;
  }

  // Fritsch–Carlson limiter (bounds-safe reads)
  for (let i = 0; i < n - 1; i++) {
    const si = tAt(slope, i); // <-- guarantees a number
    if (si === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const mi = tAt(m, i);
    const mip1 = tAt(m, i + 1);
    const a = mi / si;
    const b = mip1 / si;
    const h = Math.hypot(a, b);
    if (h > 3) {
      const t = 3 / h;
      const adj = t * si;
      m[i] = a * adj;
      m[i + 1] = b * adj;
    }
  }

  // Build segments
  const segs: Segment[] = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const p0 = atOrThrow(pts, i);
    const p1 = atOrThrow(pts, i + 1);
    segs[i] = {
      x0: p0.x,
      x1: p1.x,
      y0: p0.y,
      y1: p1.y,
      m0: tAt(m, i),
      m1: tAt(m, i + 1),
    };
  }
  return segs;
}

function evalMonotone(segs: ReadonlyArray<Segment>, x: number): number {
  const N = segs.length;
  if (N === 0) return clamp01(x);

  const X = clamp01(x);
  // binary search
  let lo = 0,
    hi = N - 1,
    mid = 0;
  while (lo <= hi) {
    mid = (lo + hi) >>> 1;
    const s = atOrThrow(segs, mid);
    if (X < s.x0) hi = mid - 1;
    else if (X > s.x1) lo = mid + 1;
    else break;
  }
  if (mid < 0) mid = 0;
  if (mid > N - 1) mid = N - 1;

  const s = atOrThrow(segs, mid);
  const h = s.x1 - s.x0 || EPS;
  const t = (X - s.x0) / h;

  const t2 = t * t,
    t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  const y = h00 * s.y0 + h10 * h * s.m0 + h01 * s.y1 + h11 * h * s.m1;
  return clamp01(y);
}

/* ========================= CUBIC BÉZIER LUT ======================== */
export function cubicBezierLUT(
  c1: CurvePoint,
  c2: CurvePoint,
  n = 256
): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
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

/* ========================== LUT BUILD/SAMPLE ======================= */
const CACHE = new Map<string, Float32Array>();

function keyFor(points: ReadonlyArray<CurvePoint>, n: number): string {
  const s = sanitize(points)
    .map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`)
    .join("|");
  return `${n}:${s}`;
}

export function buildLUT(
  points: ReadonlyArray<CurvePoint>,
  n = 256
): Float32Array {
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

/** Bounds-safe read for Float32Array (never returns undefined). */
function fAt(buf: Float32Array, i: number): number {
  return tAt(buf, i);
}

export function sampleLUT(lut: Float32Array, t: number): number {
  const n = lut.length;
  if (n < 2) return clamp01(t);
  const x = clamp01(t) * (n - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = fAt(lut, i);
  const b = fAt(lut, i + 1);
  return a + (b - a) * f;
}
