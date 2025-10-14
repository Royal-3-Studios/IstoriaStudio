// FILE: src/lib/brush/backends/ribbon/core/resample.ts
import type { RenderPathPoint } from "@/lib/brush/engine.types";

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

const EPS = 1e-6;
const MIN_STEP = 0.3;
const MAX_STEP = 2.5;

/* =============================== utils =============================== */

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function must<T>(v: T | undefined, where: string): T {
  if (v === undefined) throw new Error(`Ribbon: ${where} is undefined`);
  return v;
}

function readPressureLike(p: Partial<RenderPathPoint>): number {
  const v =
    (typeof p.p === "number" && Number.isFinite(p.p) ? p.p : undefined) ??
    (typeof p.pressure === "number" && Number.isFinite(p.pressure)
      ? p.pressure
      : undefined);
  return typeof v === "number" ? v : 1;
}

function tangentAngleRad(
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  return Math.atan2(by - ay, bx - ax);
}

/* ===================== t-normalization + search ===================== */

function lengthAndNormalizeT(pts: ReadonlyArray<P>): {
  pts: P[];
  total: number;
} {
  const n = pts.length;
  if (n === 0) return { pts: [], total: 0 };
  if (n === 1) {
    const p0 = must(pts[0], "pts[0]");
    return {
      pts: [{ x: p0.x, y: p0.y, pressure: p0.pressure, t: 0 }],
      total: 0,
    };
  }

  // Build cumulative distance array (no spreading from possibly-undefined indices)
  const accum: P[] = [];
  const p0 = must(pts[0], "pts[0]");
  accum.push({ x: p0.x, y: p0.y, pressure: p0.pressure, t: 0 });

  let total = 0;
  for (let i = 1; i < n; i++) {
    const a = must(pts[i - 1], `pts[${i - 1}]`);
    const b = must(pts[i], `pts[${i}]`);
    total += Math.hypot(b.x - a.x, b.y - a.y);
    accum.push({ x: b.x, y: b.y, pressure: b.pressure, t: total });
  }

  if (total <= 0) {
    // Degenerate: all points coincident
    return {
      pts: accum.map((p) => ({ x: p.x, y: p.y, pressure: p.pressure, t: 0 })),
      total: 0,
    };
  }

  const inv = 1 / total;
  const normalized = accum.map((p) => ({
    x: p.x,
    y: p.y,
    pressure: p.pressure,
    t: p.t * inv,
  }));

  return { pts: normalized, total };
}

function segmentAt(
  pts: ReadonlyArray<P>,
  s01: number
): { i0: number; i1: number; u: number } {
  // s01 in [0..1] along normalized t
  const n = pts.length;
  if (n < 2) return { i0: 0, i1: 0, u: 0 };

  let lo = 0;
  let hi = n - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    const pm = must(pts[mid], `pts[${mid}]`);
    if (pm.t < s01) lo = mid;
    else hi = mid;
  }
  const a = must(pts[lo], `pts[${lo}]`);
  const b = must(pts[hi], `pts[${hi}]`);
  const denom = Math.max(EPS, b.t - a.t);
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

/* ============================= main entry ============================= */

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

  // Build concrete points (avoid reading optional fields without guards)
  const raw: P[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = must(path[i], `path[${i}]`);
    const x = Number.isFinite(p.x) ? p.x : 0;
    const y = Number.isFinite(p.y) ? p.y : 0;
    raw[i] = { x, y, pressure: readPressureLike(p), t: 0 };
  }

  const { pts, total } = lengthAndNormalizeT(raw);
  if (pts.length < 2 || total <= 0) {
    const p0 = must(pts[0] ?? raw[0], "p0");
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

  // Evaluate at arc-length sArc (px)
  const evalAt = (sArc: number): RibbonSample => {
    const s01 = Math.min(1, Math.max(0, sArc / total));
    const seg = segmentAt(pts, s01);
    const a = must(pts[seg.i0], `pts[${seg.i0}]`);
    const b = must(pts[seg.i1], `pts[${seg.i1}]`);
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
  const safeStep = Number.isFinite(stepPx)
    ? Math.max(MIN_STEP, Math.min(MAX_STEP, stepPx))
    : 1;

  for (let s = 0; s <= total + EPS; s += safeStep) {
    out.push(evalAt(Math.min(s, total)));
  }
  const last = out[out.length - 1];
  if (!last || last.arcLen < total) {
    out.push(evalAt(total));
  }
  return { samples: out, totalLen: total };
}
