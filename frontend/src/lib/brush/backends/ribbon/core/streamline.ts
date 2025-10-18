// FILE: src/lib/brush/backends/ribbon/core/streamline.ts

import type {
  EngineStrokePath,
  RenderPathPoint,
} from "@/lib/brush/engine.types";

/* ----------------------------- local helpers ----------------------------- */

function must<T>(v: T | undefined, label: string): T {
  if (v === undefined) throw new Error(`Undefined at ${label}`);
  return v;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const numOr = (v: unknown, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;

const getPressure = (pt: { p?: number; pressure?: number }): number =>
  typeof pt.p === "number"
    ? pt.p
    : typeof pt.pressure === "number"
      ? pt.pressure
      : 1;

/** signed shortest angle delta a→b in radians */
const shortestAngleDelta = (a: number, b: number): number => {
  let d = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

/** fallback tangent angle inferred from neighbors */
function inferAngle(src: RenderPathPoint[], i: number): number {
  const n = src.length;
  if (i < n - 1) {
    const a = must(src[i], `src[${i}]`);
    const b = must(src[i + 1], `src[${i + 1}]`);
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) return Math.atan2(dy, dx);
  }
  if (i > 0) {
    const a = must(src[i - 1], `src[${i - 1}]`);
    const b = must(src[i], `src[${i}]`);
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) return Math.atan2(dy, dx);
  }
  return 0;
}

/* ------------------------------- main API -------------------------------- */

/**
 * Exponential moving-average path smoother (aka "streamline").
 * factor: 0..100 (0 = off, 100 = strong)
 *
 * Accepts either your EngineStrokePath or any Iterable/array of RenderPathPoint.
 */
export function streamlinePath(
  points: EngineStrokePath,
  factor?: number
): RenderPathPoint[];
export function streamlinePath(
  points: Iterable<RenderPathPoint>,
  factor?: number
): RenderPathPoint[];
export function streamlinePath(
  points: EngineStrokePath | Iterable<RenderPathPoint>,
  factor = 0
): RenderPathPoint[] {
  // Normalize to a concrete array for safe strict indexing
  const src: RenderPathPoint[] = Array.isArray(points)
    ? (points as unknown as RenderPathPoint[])
    : Array.from(points as Iterable<RenderPathPoint>);

  const n = src.length;
  if (n === 0) return [];

  const kRaw = clamp01(factor / 100);
  // keep some responsiveness even at 100
  const k = kRaw * 0.95;
  const oneMinusK = 1 - k;

  const out: RenderPathPoint[] = [];

  // Seed
  {
    const s0 = must(src[0], "src[0]");
    const p0 = getPressure(s0);
    const angle0 = numOr(s0.angle, inferAngle(src, 0));
    const tilt0 = numOr(s0.tilt, 0);
    const t0 = numOr(s0.t, 0);
    out.push({
      x: s0.x,
      y: s0.y,
      p: p0,
      pressure: p0,
      angle: angle0,
      tilt: tilt0,
      t: t0,
    });
  }

  if (n === 1 || k === 0) {
    for (let i = 1; i < n; i++) {
      const s = must(src[i], `src[${i}]`);
      const p = getPressure(s);
      out.push({
        x: s.x,
        y: s.y,
        p,
        pressure: p,
        angle: numOr(s.angle, inferAngle(src, i)),
        tilt: numOr(s.tilt, 0),
        t: numOr(s.t, 0),
      });
    }
    return out;
  }

  // EMA smoothing
  for (let i = 1; i < n; i++) {
    const s = must(src[i], `src[${i}]`);
    const prev = must(out[i - 1], `out[${i - 1}]`);

    const x = prev.x * k + s.x * oneMinusK;
    const y = prev.y * k + s.y * oneMinusK;

    const sp = getPressure(s);
    const pp = getPressure(prev);
    const p = pp * k + sp * oneMinusK;

    const srcAngle = numOr(s.angle, inferAngle(src, i));
    const prevAngle = numOr(prev.angle, inferAngle(src, i - 1));
    const angle =
      prevAngle + shortestAngleDelta(prevAngle, srcAngle) * oneMinusK;

    const tilt = numOr(prev.tilt, 0) * k + numOr(s.tilt, 0) * oneMinusK;

    const t =
      typeof prev.t === "number" && typeof s.t === "number"
        ? prev.t * k + s.t * oneMinusK
        : numOr(s.t, numOr(prev.t, 0));

    out.push({ x, y, p, pressure: p, angle, tilt, t });
  }

  return out;
}
