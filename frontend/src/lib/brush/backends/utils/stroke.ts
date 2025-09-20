import type { RenderPathPoint } from "@/lib/brush/engine";
import type { RNG } from "./random";
import { clamp, lerp } from "./math";

/* ============================== Types ============================== */

export type TaperProfile =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "expo"
  | "custom";

/** Optional custom LUT samples for taper curves (monotonic in [0,1]). */
export type CurveLUT = ReadonlyArray<number>;

export interface StrokePlacementOptions {
  /** Brush diameter in CSS px. */
  baseSizePx: number;

  /** Spacing as % of diameter (e.g. 4 = 4% of diameter). */
  spacingPercent: number; // default 4

  /** Jitter as % of spacing (0..100). */
  jitterPercent?: number; // default 0.5

  /** Scatter in CSS px, normal to path, applied per stamp. */
  scatterPx?: number; // default 0

  /** Stamps per step (>=1). */
  stampsPerStep?: number; // default 1

  /** If >0, path smoothing (0..100) where higher=more smoothing. */
  streamline?: number; // default 0

  /** Angle follows path heading; 0=off, 1=fully follow. */
  angleFollowDirection?: number; // default 0

  /** Random angle jitter per stamp in degrees. */
  angleJitterDeg?: number; // default 0

  /** Clamp min tip width in px (after taper). 0 = none. */
  tipMinPx?: number; // default 0

  /** How the START tip narrows (0..1). */
  tipScaleStart?: number; // default 0.85

  /** How the END tip narrows (0..1). */
  tipScaleEnd?: number; // default 0.85

  /** Profile shapes for start and end taper. */
  taperProfileStart?: TaperProfile; // default "linear"
  taperProfileEnd?: TaperProfile; // default "linear"

  /** Optional custom curve LUTs for taper profiles (values in [0,1]). */
  taperProfileStartCurve?: CurveLUT;
  taperProfileEndCurve?: CurveLUT;

  /** Asymmetric body shaping: -1..+1 makes end thicker/thinner. */
  endBias?: number; // default 0

  /** Push thickness toward uniform marker look (0..1). */
  uniformity?: number; // default 0

  /** Random source; if omitted, Math.random() is used. */
  rng?: RNG;
}

export interface Stamp {
  /** CSS px position. */
  x: number;
  y: number;

  /** Degrees. Includes follow + jitter; backends may add tip angle. */
  angleDeg: number;

  /** Pressure at this point if provided upstream (0..1), else 1. */
  pressure: number;

  /** 0..1 fraction along the stroke. */
  t: number;

  /** Width scale (0..1) after taper/body shaping (pre tipMinPx clamp). */
  widthScale: number;

  /** Heading in degrees from path tangent (useful for tip orientation). */
  tangentDeg: number;
}

/* ============================== Internals ============================== */

type P = {
  x: number;
  y: number;
  pressure: number;
  angleDeg: number;
  t: number;
};

function sub(a: P, b: P) {
  return { x: a.x - b.x, y: a.y - b.y };
}
function len(v: { x: number; y: number }) {
  return Math.hypot(v.x, v.y);
}

/** simple one-pole smoother in *distance* domain */
function smoothPath(points: RenderPathPoint[], alpha: number): P[] {
  if (!points.length) return [];
  const out: P[] = [];
  const prev = points[0];
  let sx = prev.x,
    sy = prev.y,
    sp = prev.pressure ?? 1,
    sa = ((prev.angle ?? 0) * 180) / Math.PI;
  out.push({ x: sx, y: sy, pressure: sp, angleDeg: sa, t: 0 });

  const n = points.length;
  for (let i = 1; i < n; i++) {
    const p = points[i];
    sx = lerp(sx, p.x, alpha);
    sy = lerp(sy, p.y, alpha);
    sp = lerp(sp, p.pressure ?? 1, alpha);
    sa = lerp(sa, ((p.angle ?? 0) * 180) / Math.PI, alpha);
    out.push({ x: sx, y: sy, pressure: sp, angleDeg: sa, t: 0 });
  }
  return out;
}

function pathLengthAndT(points: P[]): { pts: P[]; length: number } {
  if (points.length === 0) return { pts: [], length: 0 };
  let total = 0;
  const out = new Array<P>(points.length);
  out[0] = { ...points[0], t: 0 };
  for (let i = 1; i < points.length; i++) {
    const d = sub(points[i], points[i - 1]);
    const ds = len(d);
    total += ds;
    out[i] = { ...points[i], t: total };
  }
  // normalize t to 0..1
  if (total > 0) {
    for (let i = 0; i < out.length; i++) out[i].t = out[i].t / total;
  } else {
    for (let i = 0; i < out.length; i++) out[i].t = 0;
  }
  return { pts: out, length: total };
}

function segmentAt(pts: P[], s: number): { i0: number; i1: number; u: number } {
  // s in [0..1] along path t coordinate
  if (pts.length < 2) return { i0: 0, i1: 0, u: 0 };
  // binary search the t array
  let lo = 0,
    hi = pts.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].t < s) lo = mid;
    else hi = mid;
  }
  const a = pts[lo],
    b = pts[hi];
  const denom = Math.max(1e-6, b.t - a.t);
  const u = clamp((s - a.t) / denom, 0, 1);
  return { i0: lo, i1: hi, u };
}

function interp(a: P, b: P, u: number): P {
  return {
    x: lerp(a.x, b.x, u),
    y: lerp(a.y, b.y, u),
    pressure: lerp(a.pressure, b.pressure, u),
    angleDeg: lerp(a.angleDeg, b.angleDeg, u),
    t: lerp(a.t, b.t, u),
  };
}

function tangentDeg(a: P, b: P): number {
  const d = sub(b, a);
  return (Math.atan2(d.y, d.x) * 180) / Math.PI;
}

function rand(rng?: RNG): number {
  return rng ? rng.nextFloat() : Math.random();
}

function pickTaperValue(
  t: number,
  profile: TaperProfile,
  custom?: CurveLUT
): number {
  const tt = clamp(t, 0, 1);
  switch (profile) {
    case "linear":
      return tt;
    case "easeIn":
      return tt * tt;
    case "easeOut":
      return 1 - (1 - tt) * (1 - tt);
    case "easeInOut":
      return tt < 0.5 ? 2 * tt * tt : 1 - Math.pow(-2 * tt + 2, 2) / 2;
    case "expo":
      return tt <= 0 ? 0 : tt >= 1 ? 1 : Math.pow(2, 10 * (tt - 1));
    case "custom":
      if (custom && custom.length >= 2) {
        const x = tt * (custom.length - 1);
        const i = Math.floor(x);
        const f = x - i;
        const a = custom[i];
        const b = custom[Math.min(custom.length - 1, i + 1)];
        return a + (b - a) * f;
      }
      return tt;
    default:
      return tt;
  }
}

/* ============================== Public API ============================== */

/**
 * Turn a raw input path into evenly spaced stamp placements with tapering and jitter.
 * - Input points are in **CSS px** (like RenderPathPoint).
 * - Output stamps carry angle (follow + jitter), widthScale after taper, and pressure.
 */
export function pathToStamps(
  rawPath: ReadonlyArray<RenderPathPoint>,
  opts: StrokePlacementOptions
): Stamp[] {
  if (rawPath.length === 0) return [];

  const spacingPct = opts.spacingPercent;
  const jitterPct = opts.jitterPercent ?? 0.5;
  const scatterPx = Math.max(0, opts.scatterPx ?? 0);
  const stampsPerStep = Math.max(1, Math.round(opts.stampsPerStep ?? 1));

  // path smoothing factor: map 0..100 -> alpha 0..1
  const streamline = clamp(opts.streamline ?? 0, 0, 100) / 100;
  const alpha = streamline <= 0 ? 1 : Math.max(0.05, 1 - streamline); // higher streamline -> lower alpha

  const smoothed: P[] =
    streamline > 0
      ? smoothPath(rawPath as RenderPathPoint[], alpha)
      : rawPath.map((p) => ({
          x: p.x,
          y: p.y,
          pressure: p.pressure ?? 1,
          angleDeg: ((p.angle ?? 0) * 180) / Math.PI,
          t: 0,
        }));

  const { pts, length } = pathLengthAndT(smoothed);
  if (length <= 0 || pts.length < 2) {
    const p0 = pts[0];
    if (!p0) return [];
    const t = 0.0;
    const baseAngle = 0;
    const angle =
      baseAngle + (opts.angleJitterDeg ?? 0) * (rand(opts.rng) * 2 - 1);
    const widthScale = computeWidthScale(t, opts);
    return [
      {
        x: p0.x,
        y: p0.y,
        angleDeg: angle,
        pressure: p0.pressure,
        t,
        widthScale,
        tangentDeg: 0,
      },
    ];
  }

  // convert spacing % to absolute distance
  const step = Math.max(0.25, (spacingPct / 100) * opts.baseSizePx);

  const numSteps = Math.max(1, Math.floor(length / step));
  const stamps: Stamp[] = [];
  const followAmt = clamp(opts.angleFollowDirection ?? 0, 0, 1);
  const angleJitter = Math.max(0, opts.angleJitterDeg ?? 0);

  for (let s = 0; s <= numSteps; s++) {
    // base s in [0..1] along path
    const s01 = numSteps === 0 ? 0 : s / numSteps;

    // jitter along the path in units of spacing
    const jitterU =
      (rand(opts.rng) * 2 - 1) * (jitterPct / 100) * (1 / (numSteps + 1));
    const sj = clamp(s01 + jitterU, 0, 1);

    // compute segment + local interpolation
    const seg = segmentAt(pts, sj);
    const a = pts[seg.i0],
      b = pts[seg.i1];
    const p = interp(a, b, seg.u);

    // local tangent
    const tan = tangentDeg(a, b);

    for (let k = 0; k < stampsPerStep; k++) {
      // normal for scatter (perpendicular to tangent)
      const rad = (tan * Math.PI) / 180;
      const nx = -Math.sin(rad);
      const ny = Math.cos(rad);

      const scatter = scatterPx > 0 ? (rand(opts.rng) * 2 - 1) * scatterPx : 0;
      const x = p.x + nx * scatter;
      const y = p.y + ny * scatter;

      const followAngle = followAmt * tan;
      const jitterAngle =
        angleJitter > 0 ? (rand(opts.rng) * 2 - 1) * angleJitter : 0;
      const angleDeg = followAngle + jitterAngle;

      const t = p.t; // 0..1 along the stroke
      const widthScale = computeWidthScale(t, opts);

      stamps.push({
        x,
        y,
        angleDeg,
        pressure: p.pressure,
        t,
        widthScale,
        tangentDeg: tan,
      });
    }
  }

  return stamps;
}

/** Compute width scale 0..1 along the stroke using taper options. */
export function computeWidthScale(
  t: number,
  opts: StrokePlacementOptions
): number {
  const start = clamp(opts.tipScaleStart ?? 0.85, 0, 1);
  const end = clamp(opts.tipScaleEnd ?? 0.85, 0, 1);
  const uniformity = clamp(opts.uniformity ?? 0, 0, 1);
  const endBias = clamp(opts.endBias ?? 0, -1, 1);

  // easing for start and end
  const startProf = opts.taperProfileStart ?? "linear";
  const endProf = opts.taperProfileEnd ?? "linear";

  const sCurve = pickTaperValue(1 - t, startProf, opts.taperProfileStartCurve);
  const eCurve = pickTaperValue(t, endProf, opts.taperProfileEndCurve);

  // base scale from start/end taper
  let scale = 1.0;
  scale *= lerp(1, start, sCurve);
  scale *= lerp(1, end, eCurve);

  // endBias fattens/thins the end vs start
  if (endBias !== 0) {
    const bias = endBias > 0 ? t : 1 - t;
    scale *= lerp(1, 1.25, Math.abs(endBias) * bias);
  }

  // uniformity pushes toward flat marker look
  if (uniformity > 0) {
    scale = lerp(scale, 1.0, uniformity);
  }

  // tipMinPx clamp will be applied by backends when converting scale->pixels
  return clamp(scale, 0, 1);
}
