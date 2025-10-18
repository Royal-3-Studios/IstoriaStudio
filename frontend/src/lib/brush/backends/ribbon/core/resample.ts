// FILE: src/lib/brush/backends/ribbon/core/resample.ts

import type {
  EngineStrokePath,
  RenderPathPoint,
} from "@/lib/brush/engine.types";
export type RibbonSample = RenderPathPoint;
/* =============================================================================
 * Small utilities
 * ============================================================================= */

function must<T>(v: T | undefined, label: string): T {
  if (v === undefined) throw new Error(`Undefined at ${label}`);
  return v;
}

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const hypot2 = (dx: number, dy: number): number => Math.hypot(dx, dy);

/** Pick pressure from either `p` or `pressure`, defaulting to 1. */
const getPressure = (pt: { p?: number; pressure?: number }): number =>
  typeof pt.p === "number"
    ? pt.p
    : typeof pt.pressure === "number"
      ? pt.pressure
      : 1;

const numOr = (v: unknown, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;

/** Blend angles by the shortest arc (radians). */
function lerpAngleShortest(a: number, b: number, t: number): number {
  // bring delta into (-π, π]
  let d = ((b - a + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI; // just in case % gave [-π, π)
  return a + d * t;
}

/** Interpolate two path points (pos, pressure, angle, tilt, time). */
function interpPoint(
  a: RenderPathPoint,
  b: RenderPathPoint,
  t: number
): RenderPathPoint {
  const pA = getPressure(a);
  const pB = getPressure(b);
  const p = lerp(pA, pB, t);

  // angle: blend if both present, else derive from geometry
  const angle =
    typeof a.angle === "number" && typeof b.angle === "number"
      ? lerpAngleShortest(a.angle, b.angle, t)
      : Math.atan2(b.y - a.y, b.x - a.x);

  // tilt: linear if both (or one) present, else 0
  const tilt = lerp(numOr(a.tilt, 0), numOr(b.tilt, 0), t);

  // timestamp (ms): only include when at least one endpoint has a valid number
  const hasTa = typeof a.t === "number";
  const hasTb = typeof b.t === "number";
  const tt =
    hasTa && hasTb
      ? lerp(a.t as number, b.t as number, t)
      : hasTa
        ? (a.t as number)
        : hasTb
          ? (b.t as number)
          : undefined;

  // build result; IMPORTANT: omit `t` if undefined (exactOptionalPropertyTypes)
  const base = {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    p,
    pressure: p,
    angle,
    tilt,
  } as RenderPathPoint;

  return typeof tt === "number" ? { ...base, t: tt } : base;
}

/* =============================================================================
 * Public API
 * ============================================================================= */

/**
 * Arc-length resampling with fixed pixel spacing and optional perpendicular jitter.
 * Returns fully-populated `RenderPathPoint[]` with numeric fields filled.
 *
 * Overloads: accept either `EngineStrokePath` or any `Iterable<RenderPathPoint>`
 */
export default function resampleBySpacing(
  points: EngineStrokePath,
  spacingPx: number,
  jitterPx: number,
  rng: () => number
): RenderPathPoint[];
export function resampleBySpacing(
  points: Iterable<RenderPathPoint>,
  spacingPx: number,
  jitterPx: number,
  rng: () => number
): RenderPathPoint[];

/** Single implementation */
export function resampleBySpacing(
  points: EngineStrokePath | Iterable<RenderPathPoint>,
  spacingPx: number,
  jitterPx: number,
  rng: () => number
): RenderPathPoint[] {
  // Normalize to a concrete array for strict-safe indexing
  const src: RenderPathPoint[] = Array.isArray(points)
    ? (points as unknown as RenderPathPoint[])
    : Array.from(points as Iterable<RenderPathPoint>);

  const n = src.length;
  if (n === 0) return [];

  // If spacing is non-positive or just a single point, normalize & return one
  if (n === 1 || !(spacingPx > 0)) {
    const p0 = must(src[0], "src[0]");
    const p = getPressure(p0);
    const angle = typeof p0.angle === "number" ? p0.angle : 0; // no segment to infer from
    const tilt = numOr(p0.tilt, 0);

    const base: RenderPathPoint = {
      x: p0.x,
      y: p0.y,
      p,
      pressure: p,
      angle,
      tilt,
    };
    return typeof p0.t === "number" ? [{ ...base, t: p0.t as number }] : [base];
  }

  const spacing = Math.max(0.1, spacingPx);
  const jitterMax = Math.max(0, jitterPx);

  const out: RenderPathPoint[] = [];

  // Seed normalized first point
  {
    const p0 = must(src[0], "src[0]");
    const p1 = must(src[1], "src[1]");
    const p = getPressure(p0);
    const angle =
      typeof p0.angle === "number"
        ? p0.angle
        : Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const tilt = numOr(p0.tilt, 0);

    const base: RenderPathPoint = {
      x: p0.x,
      y: p0.y,
      p,
      pressure: p,
      angle,
      tilt,
    };
    out.push(typeof p0.t === "number" ? { ...base, t: p0.t as number } : base);
  }

  let lastX = out[0]!.x;
  let lastY = out[0]!.y;
  let carry = 0;

  for (let i = 0; i < n - 1; i++) {
    const a = must(src[i], `src[${i}]`);
    const b = must(src[i + 1], `src[${i + 1}]`);

    const segDx = b.x - a.x;
    const segDy = b.y - a.y;
    const segLen = hypot2(segDx, segDy);
    if (segLen <= 1e-6) continue;

    // projection from a→last, how far along this segment the last point sits
    const baseDx = lastX - a.x;
    const baseDy = lastY - a.y;
    const baseAlong = (baseDx * segDx + baseDy * segDy) / segLen;
    let remain = segLen - clamp(baseAlong, 0, segLen);

    while (carry + remain >= spacing) {
      const step = spacing - carry;
      const tSeg = clamp((baseAlong + step) / segLen, 0, 1);
      let s = interpPoint(a, b, tSeg);

      if (jitterMax > 0) {
        // left-hand unit normal
        const tx = segDx / segLen;
        const ty = segDy / segLen;
        const jmag = (rng() * 2 - 1) * jitterMax; // [-jitterMax, +jitterMax]
        s = { ...s, x: s.x + -ty * jmag, y: s.y + tx * jmag };
      }

      out.push(s);
      lastX = s.x;
      lastY = s.y;

      const newBaseAlong = baseAlong + step;
      remain = segLen - newBaseAlong;
      carry = 0;
    }

    carry += remain;
    lastX = b.x;
    lastY = b.y;
  }

  // Ensure final point included and normalized (avoid duplicate if already on end)
  const pend = must(src[n - 1], `src[${n - 1}]`);
  const last = must(out[out.length - 1], "out[last]");
  if (last.x !== pend.x || last.y !== pend.y) {
    const p = getPressure(pend);
    const prev = must(src[n - 2], `src[${n - 2}]`);
    const angle =
      typeof pend.angle === "number"
        ? pend.angle
        : Math.atan2(pend.y - prev.y, pend.x - prev.x);
    const tilt = numOr(pend.tilt, 0);

    const base: RenderPathPoint = {
      x: pend.x,
      y: pend.y,
      p,
      pressure: p,
      angle,
      tilt,
    };
    out.push(
      typeof pend.t === "number" ? { ...base, t: pend.t as number } : base
    );
  }

  return out;
}
