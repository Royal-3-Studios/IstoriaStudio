// FILE: src/lib/brush/backends/utils/stroke.ts
import type { RenderPathPoint } from "@/lib/brush/engine";
import type { RNG } from "./random";
import { clamp, lerp } from "./math";
import { mapPressure, type PressureMapOpts } from "@/lib/brush/core/pressure";

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

/** Optional input-quality tuning (sandboxed in stroke.ts). */
export type InputQualityOpts = {
  /** Predictive nudge distance in CSS px; 0 = off (typical 4–12). */
  predictPx?: number;
  /** Velocity→spacing gain (−0.2..+0.4); positive loosens at speed. */
  speedToSpacing?: number;
  /** Absolute floor for step after modulation (px). */
  minStepPx?: number;
};

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

  /** Pressure calibration; identity if omitted. */
  pressureMap?: PressureMapOpts;

  /** Optional input-quality tweaks; no-ops if omitted. */
  inputQuality?: InputQualityOpts;
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

/** Resampled point used by backends that operate in the arc-length domain. */
export type SamplePoint = { x: number; y: number; t: number; p: number };

/* ============================== Internals ============================== */

type P = {
  x: number;
  y: number;
  pressure: number;
  angleDeg: number;
  t: number; // cumulative arc fraction 0..1
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
  const p0 = points[0];
  let sx = p0.x;
  let sy = p0.y;
  let sp = p0.pressure ?? 1;
  let sa = ((p0.angle ?? 0) * 180) / Math.PI;
  out.push({ x: sx, y: sy, pressure: sp, angleDeg: sa, t: 0 });

  for (let i = 1; i < points.length; i++) {
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
  let lo = 0;
  let hi = pts.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].t < s) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
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

/* ---------- predictive nudge (px) & speed→spacing ---------- */

/** Nudge a point forward along its local tangent by predictPx (CSS px). */
function predictPointPx(
  a: P,
  b: P,
  predictPx: number
): { x: number; y: number } {
  const px = Math.max(0, Math.min(24, predictPx)); // hard clamp for stability
  if (px <= 0) return { x: b.x, y: b.y };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-3) return { x: b.x, y: b.y };
  const ux = dx / L;
  const uy = dy / L;
  return { x: b.x + ux * px, y: b.y + uy * px };
}

/**
 * Modulate step size based on a geometric "speed proxy":
 *  - localSegPx is the length (px) of the nearby source segment.
 *  - speedToSpacing ∈ [−0.3..+0.5] expands/contracts step with localSegPx.
 *  - minStepPx is a hard floor after modulation.
 */
function modulatedStepPx(
  baseStepPx: number,
  localSegPx: number,
  speedToSpacing: number,
  minStepPx: number
): number {
  // Normalize localSegPx against a nominal segment (~one step).
  const nominal = Math.max(0.5, baseStepPx); // use current base step as nominal
  const ratio = clamp(localSegPx / nominal, 0, 4); // 0..4×
  const factor = clamp(1 + speedToSpacing * (ratio - 1), 0.5, 2.0);
  const step = baseStepPx * factor;
  return Math.max(minStepPx, step);
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
 * Turn a raw input path into evenly/variably spaced stamp placements with tapering and jitter.
 * - Input points are in **CSS px** (like RenderPathPoint).
 * - Output stamps carry angle (follow + jitter), widthScale after taper, and pressure.
 * - Optional: predictive nudge + velocity-aware spacing + pressure map (all opt-in).
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
  const alpha = streamline <= 0 ? 1 : Math.max(0.05, 1 - streamline);

  // Smooth (if requested) into P points
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
    const angle =
      (opts.angleFollowDirection ?? 0) * 0 + // follow=0 at single point
      (opts.angleJitterDeg ?? 0) * (rand(opts.rng) * 2 - 1);
    const widthScale = computeWidthScale(t, opts);
    return [
      {
        x: p0.x,
        y: p0.y,
        angleDeg: angle,
        pressure: mapPressure(p0.pressure, opts.pressureMap),
        t,
        widthScale,
        tangentDeg: 0,
      },
    ];
  }

  // convert spacing % to absolute distance (base step)
  const baseStep = Math.max(0.25, (spacingPct / 100) * opts.baseSizePx);

  // input quality (all optional)
  const iq = opts.inputQuality ?? {};
  const predictPx = Math.max(0, Math.min(24, iq.predictPx ?? 0));
  const kSpeed = iq.speedToSpacing ?? 0;
  const minStepPx = Math.max(0.25, iq.minStepPx ?? 0.5);

  const stamps: Stamp[] = [];
  const followAmt = clamp(opts.angleFollowDirection ?? 0, 0, 1);
  const angleJitter = Math.max(0, opts.angleJitterDeg ?? 0);

  // Walker over arc length with variable step (enables velocity-aware spacing)
  let sArc = 0;
  const endArc = length;

  // Helper to evaluate p at arc-length s (px) and optionally apply predictive nudge
  const evalAtArcWithPredict = (
    s: number
  ): { p: P; x: number; y: number; tanDeg: number } => {
    const s01 = clamp(s / length, 0, 1);
    const seg = segmentAt(pts, s01);
    const a = pts[seg.i0];
    const b = pts[seg.i1];
    const p = interp(a, b, seg.u);
    const tan = tangentDeg(a, b);

    if (predictPx > 0) {
      const nudged = predictPointPx(a, b, predictPx);
      return { p, x: nudged.x, y: nudged.y, tanDeg: tan };
    }
    return { p, x: p.x, y: p.y, tanDeg: tan };
  };

  while (sArc <= endArc + 1e-3) {
    // --- along-path jitter in *arc length px* (percent of spacing) ---
    const jitterArc = (rand(opts.rng) * 2 - 1) * (jitterPct / 100) * baseStep;
    const sArcJittered = clamp(sArc + jitterArc, 0, endArc);

    const { p, x, y, tanDeg } = evalAtArcWithPredict(sArcJittered);

    for (let k = 0; k < stampsPerStep; k++) {
      // normal for scatter (perpendicular to tangent)
      const rad = (tanDeg * Math.PI) / 180;
      const nx = -Math.sin(rad);
      const ny = Math.cos(rad);

      const scatter = scatterPx > 0 ? (rand(opts.rng) * 2 - 1) * scatterPx : 0;
      const sx = x + nx * scatter;
      const sy = y + ny * scatter;

      const followAngle = followAmt * tanDeg;
      const jitterAngle =
        angleJitter > 0 ? (rand(opts.rng) * 2 - 1) * angleJitter : 0;
      const angleDeg = followAngle + jitterAngle;

      const t = p.t; // 0..1 along the stroke
      const widthScale = computeWidthScale(t, opts);

      stamps.push({
        x: sx,
        y: sy,
        angleDeg,
        pressure: mapPressure(p.pressure, opts.pressureMap),
        t,
        widthScale,
        tangentDeg: tanDeg,
      });
    }

    // --- step advance (velocity-aware if enabled) ---
    // Use the *raw* local segment length near the unjittered sArc as a speed proxy.
    const s01 = clamp(sArc / length, 0, 1);
    const seg = segmentAt(pts, s01);
    const a = pts[seg.i0];
    const b = pts[seg.i1];
    const localSegPx = len(sub(b, a)); // px per raw-segment sample

    const stepPx =
      kSpeed !== 0
        ? modulatedStepPx(baseStep, localSegPx, kSpeed, minStepPx)
        : baseStep;

    sArc += stepPx;
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

/* ============================== Helpers expected by backends ============================== */

/** Map UI spacing (percent or fraction) to a safe fraction of diameter. */
export function resolveSpacingFraction(
  uiSpacing?: number,
  fallbackPct = 3
): number {
  const raw = typeof uiSpacing === "number" ? uiSpacing : fallbackPct;
  const frac = raw > 1 ? raw / 100 : raw;
  // Safe default range used by the stamping backend
  return Math.max(0.02, Math.min(0.08, frac));
}

/** Resample a stroke path at ~stepPx (CSS px) keeping pressure interpolated. */
export function resamplePath(
  points: ReadonlyArray<RenderPathPoint>,
  stepPx: number
): SamplePoint[] {
  const out: SamplePoint[] = [];
  if (!points || points.length < 2) return out;

  // Build P points first (no smoothing here; caller can smooth upstream)
  const Pts: P[] = points.map((p) => ({
    x: p.x,
    y: p.y,
    pressure: p.pressure ?? 1,
    angleDeg: ((p.angle ?? 0) * 180) / Math.PI,
    t: 0,
  }));
  const { pts, length } = pathLengthAndT(Pts);
  if (length <= 0) return out;

  // helper to evaluate position/pressure at target arc-length s (in px)
  function evalAtS(sArc: number) {
    const s = clamp(sArc / length, 0, 1);
    const seg = segmentAt(pts, s);
    const a = pts[seg.i0];
    const b = pts[seg.i1];
    const p = interp(a, b, seg.u);
    return p;
  }

  const first = evalAtS(0);
  out.push({ x: first.x, y: first.y, t: 0, p: first.pressure });

  const step = Math.max(0.3, Math.min(0.75, stepPx));
  for (let s = step; s < length; s += step) {
    const p = evalAtS(s);
    out.push({ x: p.x, y: p.y, t: p.t, p: p.pressure });
  }
  const last = evalAtS(length);
  out.push({ x: last.x, y: last.y, t: 1, p: last.pressure });

  return out;
}

/** Unit outward normal for segment A→B (useful for split nibs & scatter). */
export function segmentNormal(ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const L = Math.hypot(dx, dy) || 1;
  return { nx: -dy / L, ny: dx / L };
}
