// FILE: src/lib/brush/backends/ribbon/core/resample.ts
import type { RenderPathPoint } from "@/lib/brush/engine";

/** Output sample used by ribbon passes. */
export type RibbonSample = {
  x: number;
  y: number;
  angleRad: number; // radians
  arcLen: number; // px along path
  t: number; // 0..1 along path
  pressure: number; // 0..1 (best-effort if missing)
};

type P = {
  x: number;
  y: number;
  pressure: number;
  t: number; // cumulative distance (px) during build, normalized later to 0..1
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function must<T>(v: T | undefined, where: string): T {
  if (v === undefined) throw new Error(`Ribbon: ${where} is undefined`);
  return v;
}

function lengthAndNormalizeT(pts: ReadonlyArray<P>): {
  pts: P[];
  total: number;
} {
  const n = pts.length;
  if (n === 0) return { pts: [], total: 0 };
  if (n === 1) return { pts: [{ ...pts[0]!, t: 0 }], total: 0 };

  let total = 0;
  const out = new Array<P>(n);
  out[0] = { ...must(pts[0], "pts[0]"), t: 0 };
  for (let i = 1; i < n; i++) {
    const a = must(pts[i - 1], `pts[${i - 1}]`);
    const b = must(pts[i], `pts[${i}]`);
    total += Math.hypot(b.x - a.x, b.y - a.y);
    out[i] = { ...b, t: total };
  }
  if (total > 0) {
    const inv = 1 / total;
    for (let i = 0; i < n; i++) out[i] = { ...out[i]!, t: out[i]!.t * inv };
  } else {
    for (let i = 0; i < n; i++) out[i] = { ...out[i]!, t: 0 };
  }
  return { pts: out, total };
}

function segmentAt(
  pts: ReadonlyArray<P>,
  s01: number
): { i0: number; i1: number; u: number } {
  // s01 in [0..1] along normalized t
  const n = pts.length;
  if (n < 2) return { i0: 0, i1: 0, u: 0 };

  let lo = 0,
    hi = n - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid]!.t < s01) lo = mid;
    else hi = mid;
  }
  const a = pts[lo]!,
    b = pts[hi]!;
  const denom = Math.max(1e-6, b.t - a.t);
  const u = Math.min(1, Math.max(0, (s01 - a.t) / denom));
  return { i0: lo, i1: hi, u };
}

function interp(a: P, b: P, u: number): P {
  return {
    x: lerp(a.x, b.x, u),
    y: lerp(a.y, b.y, u),
    pressure: lerp(a.pressure, b.pressure, u),
    t: lerp(a.t, b.t, u),
  };
}

function tangentAngleRad(
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  return Math.atan2(by - ay, bx - ax);
}

/**
 * Resample a RenderPathPoint[] by approximately `stepPx` arc-length steps.
 * Returns samples with heading, cumulative arcLen (px), and t ∈ [0..1].
 */
export function resampleRibbonPath(
  path: ReadonlyArray<RenderPathPoint>,
  stepPx: number
): { samples: RibbonSample[]; totalLen: number } {
  const n = path.length;
  if (n === 0) return { samples: [], totalLen: 0 };

  // Build concrete points
  const raw: P[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = must(path[i], `path[${i}]`);
    raw[i] = {
      x: Number.isFinite(p.x) ? p.x : 0,
      y: Number.isFinite(p.y) ? p.y : 0,
      pressure: Number.isFinite(p.pressure as number)
        ? (p.pressure as number)
        : 1,
      t: 0,
    };
  }

  const { pts, total } = lengthAndNormalizeT(raw);
  if (pts.length < 2 || total <= 0) {
    const p0 = pts[0] ?? raw[0]!;
    return {
      samples: [
        {
          x: p0.x,
          y: p0.y,
          angleRad: 0,
          arcLen: 0,
          t: 0,
          pressure: p0.pressure,
        },
      ],
      totalLen: 0,
    };
  }

  // evaluate at arc-length sArc (px)
  const evalAt = (sArc: number): RibbonSample => {
    const s01 = Math.min(1, Math.max(0, sArc / total));
    const seg = segmentAt(pts, s01);
    const a = pts[seg.i0]!,
      b = pts[seg.i1]!;
    const p = interp(a, b, seg.u);
    const ang = tangentAngleRad(a.x, a.y, b.x, b.y);
    return {
      x: p.x,
      y: p.y,
      angleRad: ang,
      arcLen: s01 * total,
      t: p.t,
      pressure: p.pressure,
    };
  };

  const out: RibbonSample[] = [];
  const safeStep = Math.max(0.3, Math.min(2.5, stepPx));
  for (let s = 0; s <= total + 1e-6; s += safeStep) {
    out.push(evalAt(Math.min(s, total)));
  }
  if (out.length === 0 || out[out.length - 1]!.arcLen < total) {
    out.push(evalAt(total));
  }
  return { samples: out, totalLen: total };
}
