// FILE: src/lib/brush/backends/utils/stroke.ts
// Canonical stroke/path utilities for all backends (strict-safe; no `any`)

import type { RenderOptions, RenderPathPoint } from "@/lib/brush/engine.types";
import type { RNG } from "@backends/utils/random";
import { clamp, lerp } from "@backends/utils/math";
import { mapPressure, type PressureMapOpts } from "@/lib/brush/core/pressure";

/* =============================================================================
 * Public Types (unchanged surface)
 * ============================================================================= */

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

/** Placement for a single rendered stamp. */
export interface Stamp {
  x: number;
  y: number;
  angleDeg: number;
  pressure: number;
  t: number; // 0..1 along the stroke
  widthScale: number; // 0..1 after taper/body shaping
  tangentDeg: number; // path heading
}

/** Resampled point used by backends that operate in the arc-length domain. */
export type SamplePoint = { x: number; y: number; t: number; p: number };

/** Resampled point with a tangent angle in degrees (for ribbon outlines, etc.). */
export type SampleWithAngle = SamplePoint & { tangentDeg: number };

/* =============================================================================
 * Internal Types (clear names)
 * ============================================================================= */

/** Strict internal path sample used for geometry & timing. */
interface InternalPathSample {
  x: number;
  y: number;
  pressure: number; // 0..1
  tangentDeg: number; // orientation
  /**
   * Path parameter (0..1) along cumulative arc length.
   * Initially holds cumulative distance (px) until normalized.
   */
  pathParam: number;
  /** Original timestamp in ms from RenderPathPoint.t — present only if provided. */
  timeMs?: number;
}

/* =============================================================================
 * Tiny utilities
 * ============================================================================= */

function must<T>(v: T | undefined, where = "value"): T {
  if (v === undefined) throw new Error(`Invariant: ${where} is undefined`);
  return v;
}

function subtract(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function length2D(v: { x: number; y: number }) {
  return Math.hypot(v.x, v.y);
}

function toDegrees(rad: number) {
  return (rad * 180) / Math.PI;
}

function tangentDegFrom(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const d = subtract(b, a);
  return toDegrees(Math.atan2(d.y, d.x));
}

function random01(rng?: RNG): number {
  return rng ? rng.nextFloat() : Math.random();
}

/* =============================================================================
 * Smoothing & Parameterization
 * ============================================================================= */

/** One-pole smoother in *distance* domain for points/pressure/orientation. */
function smoothPathOnePole(
  input: ReadonlyArray<RenderPathPoint>,
  alpha: number
): InternalPathSample[] {
  if (input.length === 0) return [];
  const first = must(input[0], "points[0]");
  const sx0 = Number.isFinite(first.x) ? first.x : 0;
  const sy0 = Number.isFinite(first.y) ? first.y : 0;
  let sx = sx0;
  let sy = sy0;
  let sp = Number.isFinite(first.pressure as number)
    ? (first.pressure as number)
    : 1;
  let st = Number.isFinite(first.angle as number)
    ? toDegrees(first.angle as number)
    : 0;
  const out: InternalPathSample[] = [];
  out.push({
    x: sx,
    y: sy,
    pressure: sp,
    tangentDeg: st,
    pathParam: 0,
    ...(typeof first.t === "number" ? { timeMs: first.t as number } : {}),
  });

  for (let i = 1; i < input.length; i++) {
    const p = must(input[i], `points[${i}]`);
    const px = Number.isFinite(p.x) ? p.x : sx;
    const py = Number.isFinite(p.y) ? p.y : sy;
    const pp = Number.isFinite(p.pressure as number)
      ? (p.pressure as number)
      : sp;
    const pa = Number.isFinite(p.angle as number)
      ? toDegrees(p.angle as number)
      : st;

    sx = lerp(sx, px, alpha);
    sy = lerp(sy, py, alpha);
    sp = lerp(sp, pp, alpha);
    st = lerp(st, pa, alpha);

    out.push({
      x: sx,
      y: sy,
      pressure: sp,
      tangentDeg: st,
      pathParam: 0,
      ...(typeof p.t === "number" ? { timeMs: p.t as number } : {}),
    });
  }
  return out;
}

/** Compute cumulative arc length & normalize to pathParam in [0..1]. */
function computePathLengthAndParam(ptsIn: ReadonlyArray<InternalPathSample>): {
  pts: InternalPathSample[];
  lengthPx: number;
} {
  const n = ptsIn.length;
  if (n === 0) return { pts: [], lengthPx: 0 };
  if (n === 1) {
    const only = must(ptsIn[0], "pts[0]");
    return { pts: [{ ...only, pathParam: 0 }], lengthPx: 0 };
  }

  let total = 0;
  const pts: InternalPathSample[] = new Array(n);
  pts[0] = { ...must(ptsIn[0], "pts[0]"), pathParam: 0 };
  for (let i = 1; i < n; i++) {
    const curr = must(ptsIn[i], `pts[${i}]`);
    const prev = must(ptsIn[i - 1], `pts[${i - 1}]`);
    const ds = length2D(subtract(curr, prev));
    total += ds;
    // spread keeps timeMs as-is without ever assigning undefined
    pts[i] = { ...curr, pathParam: total };
  }

  if (total > 0) {
    const inv = 1 / total;
    for (let i = 0; i < n; i++) {
      const p = must(pts[i], `pts[${i}]`);
      pts[i] = { ...p, pathParam: p.pathParam * inv };
    }
  } else {
    for (let i = 0; i < n; i++) {
      const p = must(pts[i], `pts[${i}]`);
      pts[i] = { ...p, pathParam: 0 };
    }
  }
  return { pts, lengthPx: total };
}

/** Binary search into pts by pathParam to find segment containing s∈[0..1]. */
function findSegmentAtParam(
  pts: ReadonlyArray<InternalPathSample>,
  s: number
): { i0: number; i1: number; u: number } {
  const n = pts.length;
  if (n < 2) return { i0: 0, i1: 0, u: 0 };
  const target = clamp(s, 0, 1);

  let lo = 0;
  let hi = n - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    const pm = must(pts[mid], `pts[${mid}]`);
    if (pm.pathParam < target) lo = mid;
    else hi = mid;
  }
  const a = must(pts[lo], `pts[${lo}]`);
  const b = must(pts[hi], `pts[${hi}]`);
  const denom = Math.max(1e-6, b.pathParam - a.pathParam);
  const u = clamp((target - a.pathParam) / denom, 0, 1);
  return { i0: lo, i1: hi, u };
}

/** Linear interpolation between two internal samples. */
function interpolateSample(
  a: InternalPathSample,
  b: InternalPathSample,
  u: number
): InternalPathSample {
  const mixed: InternalPathSample = {
    x: lerp(a.x, b.x, u),
    y: lerp(a.y, b.y, u),
    pressure: lerp(a.pressure, b.pressure, u),
    tangentDeg: lerp(a.tangentDeg, b.tangentDeg, u),
    pathParam: lerp(a.pathParam, b.pathParam, u),
    // timeMs MUST be omitted if undefined; include only when both exist
    ...(typeof a.timeMs === "number" && typeof b.timeMs === "number"
      ? { timeMs: Math.round(lerp(a.timeMs, b.timeMs, u)) }
      : {}),
  };
  return mixed;
}

/* =============================================================================
 * Speed (px/s) & spacing modulation
 * ============================================================================= */

/** Compute px/s between two *time-stamped* points. Falls back to 0 if dt is missing. */
export function speedPxPerSecBetween(
  a: { x: number; y: number; timeMs?: number },
  b: { x: number; y: number; timeMs?: number }
): number {
  if (typeof a.timeMs !== "number" || typeof b.timeMs !== "number") return 0;
  const dtMs = Math.max(1, b.timeMs - a.timeMs); // ms
  const dsPx = Math.hypot(b.x - a.x, b.y - a.y);
  return (dsPx * 1000) / dtMs;
}

/** Edge speeds (px/s) for a path of internal samples (index i = speed from i-1 → i). */
function computeEdgeSpeeds(pts: ReadonlyArray<InternalPathSample>): number[] {
  const n = pts.length;
  const out = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    const a = must(pts[i - 1], `pts[${i - 1}]`);
    const b = must(pts[i], `pts[${i}]`);
    out[i] = speedPxPerSecBetween(a, b);
  }
  return out;
}

/** Predictive forward nudge (px) along segment direction. */
function predictiveNudgePx(
  from: InternalPathSample,
  to: InternalPathSample,
  predictPx: number
): { x: number; y: number } {
  const px = clamp(predictPx, 0, 24);
  if (px <= 0) return { x: to.x, y: to.y };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-3) return { x: to.x, y: to.y };
  const ux = dx / L;
  const uy = dy / L;
  return { x: to.x + ux * px, y: to.y + uy * px };
}

/** Map base step by a velocity proxy (or true speed) into a modulated step size. */
function modulateStepBySpeed(
  baseStepPx: number,
  localSpeedMeasure: number,
  speedToSpacing: number,
  minStepPx: number
): number {
  // Interpret "localSpeedMeasure" as "px per sample" OR "px/s" — shape is relative.
  const nominal = Math.max(0.5, baseStepPx);
  const ratio = clamp(localSpeedMeasure / nominal, 0, 4); // 0..4× nominal scale
  const factor = clamp(1 + speedToSpacing * (ratio - 1), 0.5, 2.0);
  const step = baseStepPx * factor;
  return Math.max(minStepPx, step);
}

/* =============================================================================
 * Taper profiles & width shaping
 * ============================================================================= */

function evaluateTaperProfile(
  t: number,
  profile: TaperProfile,
  custom?: CurveLUT
): number {
  const u = clamp(t, 0, 1);
  switch (profile) {
    case "linear":
      return u;
    case "easeIn":
      return u * u;
    case "easeOut":
      return 1 - (1 - u) * (1 - u);
    case "easeInOut":
      return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    case "expo":
      return u <= 0 ? 0 : u >= 1 ? 1 : Math.pow(2, 10 * (u - 1));
    case "custom": {
      if (custom && custom.length >= 2) {
        const x = u * (custom.length - 1);
        const i = Math.floor(x);
        const f = x - i;
        const a = must(custom[i], `curve[${i}]`);
        const b = must(
          custom[Math.min(custom.length - 1, i + 1)],
          `curve[${i + 1}]`
        );
        return a + (b - a) * f;
      }
      return u;
    }
    default:
      return u;
  }
}

/** Compute width scale 0..1 along the stroke using taper options. */
export function computeWidthScale(
  t: number,
  opts: StrokePlacementOptions
): number {
  const startScale = clamp(opts.tipScaleStart ?? 0.85, 0, 1);
  const endScale = clamp(opts.tipScaleEnd ?? 0.85, 0, 1);
  const uniformity = clamp(opts.uniformity ?? 0, 0, 1);
  const endBias = clamp(opts.endBias ?? 0, -1, 1);

  const startProfile = opts.taperProfileStart ?? "linear";
  const endProfile = opts.taperProfileEnd ?? "linear";

  const startK = evaluateTaperProfile(
    1 - t,
    startProfile,
    opts.taperProfileStartCurve
  );
  const endK = evaluateTaperProfile(t, endProfile, opts.taperProfileEndCurve);

  // Base scale from start/end
  let scale = 1.0;
  scale *= lerp(1, startScale, startK);
  scale *= lerp(1, endScale, endK);

  // End bias fattens/thins the end
  if (endBias !== 0) {
    const bias = endBias > 0 ? t : 1 - t;
    scale *= lerp(1, 1.25, Math.abs(endBias) * bias);
  }

  // Push toward uniform/marker look
  if (uniformity > 0) {
    scale = lerp(scale, 1.0, uniformity);
  }

  return clamp(scale, 0, 1);
}

/* =============================================================================
 * Public API
 * ============================================================================= */

/** Convenience: resolve UI spacing from RenderOptions to a *pixel* step size. */
export function spacingToStepPx(opt: RenderOptions): number {
  const spacingUi = (opt.engine.strokePath?.spacing ??
    (opt.engine.overrides?.spacing as number | undefined) ??
    6) as number;
  const baseSize = opt.baseSizePx ?? 8;
  const frac = spacingUi > 1 ? spacingUi / 100 : spacingUi;
  return Math.max(0.25, frac * baseSize);
}

/**
 * Resample a path at ~stepPx (CSS px) and carry a tangent angle in degrees.
 * Pressure is linearly interpolated; t is 0..1 over arc length.
 */
export function resampleWithAngle(
  points: ReadonlyArray<RenderPathPoint>,
  stepPx: number
): SampleWithAngle[] {
  const out: SampleWithAngle[] = [];
  if (!points || points.length < 2) return out;

  // Build concrete internal samples (no smoothing here)
  const raw: InternalPathSample[] = points.map((p) => ({
    x: Number.isFinite(p.x) ? p.x : 0,
    y: Number.isFinite(p.y) ? p.y : 0,
    pressure: Number.isFinite(p.pressure as number)
      ? (p.pressure as number)
      : 1,
    tangentDeg: Number.isFinite(p.angle as number)
      ? toDegrees(p.angle as number)
      : 0,
    pathParam: 0,
    ...(typeof p.t === "number" ? { timeMs: p.t as number } : {}),
  }));

  const { pts, lengthPx } = computePathLengthAndParam(raw);
  if (lengthPx <= 0) return out;

  const step = Math.max(0.3, Math.min(0.75, stepPx));

  const evalAtArcPx = (arcPx: number) => {
    const s = clamp(arcPx / lengthPx, 0, 1);
    const seg = findSegmentAtParam(pts, s);
    const a = must(pts[seg.i0], `pts[${seg.i0}]`);
    const b = must(pts[seg.i1], `pts[${seg.i1}]`);
    const p = interpolateSample(a, b, seg.u);
    const tanDeg = tangentDegFrom(a, b);
    return { p, tanDeg };
  };

  const first = evalAtArcPx(0);
  out.push({
    x: first.p.x,
    y: first.p.y,
    t: 0,
    p: first.p.pressure,
    tangentDeg: first.tanDeg,
  });

  for (let s = step; s < lengthPx; s += step) {
    const at = evalAtArcPx(s);
    out.push({
      x: at.p.x,
      y: at.p.y,
      t: at.p.pathParam,
      p: at.p.pressure,
      tangentDeg: at.tanDeg,
    });
  }

  const last = evalAtArcPx(lengthPx);
  out.push({
    x: last.p.x,
    y: last.p.y,
    t: 1,
    p: last.p.pressure,
    tangentDeg: last.tanDeg,
  });

  return out;
}

/**
 * Build a ribbon outline from centerline samples + width function.
 * - `samples`: output of resampleWithAngle
 * - `widthAt(u)`: returns *radius in px* (not scale) at t∈[0,1]
 * Returns a Path2D suitable for `ctx.clip()` or filling.
 */
export function buildRibbonOutline(
  samples: ReadonlyArray<SampleWithAngle>,
  widthAt: (u: number) => number
): Path2D {
  const n = samples.length;
  if (n === 0) return new Path2D();

  const left: Array<{ x: number; y: number }> = [];
  const right: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < n; i++) {
    const s = must(samples[i], `samples[${i}]`);
    const rad = (s.tangentDeg * Math.PI) / 180;
    const nx = -Math.sin(rad);
    const ny = Math.cos(rad);
    const radius = Math.max(0.25, widthAt(s.t)); // radius in px
    left.push({ x: s.x + nx * radius, y: s.y + ny * radius });
    right.push({ x: s.x - nx * radius, y: s.y - ny * radius });
  }

  const path = new Path2D();
  path.moveTo(left[0]!.x, left[0]!.y);
  for (let i = 1; i < left.length; i++) {
    const p = must(left[i], `left[${i}]`);
    path.lineTo(p.x, p.y);
  }
  for (let i = right.length - 1; i >= 0; i--) {
    const p = must(right[i], `right[${i}]`);
    path.lineTo(p.x, p.y);
  }
  path.closePath();
  return path;
}

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
  if (!rawPath || rawPath.length === 0) return [];

  const spacingPct = opts.spacingPercent;
  const jitterPct = opts.jitterPercent ?? 0.5;
  const scatterPx = Math.max(0, opts.scatterPx ?? 0);
  const stampsPerStep = Math.max(1, Math.round(opts.stampsPerStep ?? 1));

  // map 0..100 -> smoothing alpha in (0..1]
  const streamlineAmt = clamp(opts.streamline ?? 0, 0, 100) / 100;
  const smoothingAlpha =
    streamlineAmt <= 0 ? 1 : Math.max(0.05, 1 - streamlineAmt);

  // Build internal samples (smoothed or raw)
  const internal: InternalPathSample[] =
    streamlineAmt > 0
      ? smoothPathOnePole(rawPath, smoothingAlpha)
      : rawPath.map((p) => ({
          x: Number.isFinite(p.x) ? p.x : 0,
          y: Number.isFinite(p.y) ? p.y : 0,
          pressure: Number.isFinite(p.pressure as number)
            ? (p.pressure as number)
            : 1,
          tangentDeg: Number.isFinite(p.angle as number)
            ? toDegrees(p.angle as number)
            : 0,
          pathParam: 0,
          ...(typeof p.t === "number" ? { timeMs: p.t as number } : {}),
        }));

  const { pts, lengthPx } = computePathLengthAndParam(internal);
  if (pts.length === 0) return [];

  // Single-point path
  if (lengthPx <= 0 || pts.length < 2) {
    const p0 = must(pts[0], "pts[0]");
    const tFrac = 0.0;
    const follow = (opts.angleFollowDirection ?? 0) * 0;
    const jitter = (opts.angleJitterDeg ?? 0) * (random01(opts.rng) * 2 - 1);
    const angleDeg = follow + jitter;
    const widthScale = computeWidthScale(tFrac, opts);
    return [
      {
        x: p0.x,
        y: p0.y,
        angleDeg,
        pressure: mapPressure(p0.pressure, opts.pressureMap),
        t: tFrac,
        widthScale,
        tangentDeg: 0,
      },
    ];
  }

  // convert spacing % to absolute distance (base step)
  const baseStepPx = Math.max(0.25, (spacingPct / 100) * opts.baseSizePx);

  // input quality (optional)
  const iq = opts.inputQuality ?? {};
  const predictPx = clamp(iq.predictPx ?? 0, 0, 24);
  const speedToSpacing = iq.speedToSpacing ?? 0;
  const minStepPx = Math.max(0.25, iq.minStepPx ?? 0.5);

  const stamps: Stamp[] = [];
  const followAmt = clamp(opts.angleFollowDirection ?? 0, 0, 1);
  const angleJitterDeg = Math.max(0, opts.angleJitterDeg ?? 0);

  // Arc-length walker with variable step
  let arcPx = 0;
  const arcEnd = lengthPx;

  const evalAtArcPx = (sPx: number) => {
    const s = clamp(sPx / lengthPx, 0, 1);
    const seg = findSegmentAtParam(pts, s);
    const a = must(pts[seg.i0], `pts[${seg.i0}]`);
    const b = must(pts[seg.i1], `pts[${seg.i1}]`);
    const p = interpolateSample(a, b, seg.u);
    const tanDeg = tangentDegFrom(a, b);
    if (predictPx > 0) {
      const nudged = predictiveNudgePx(a, b, predictPx);
      return { p, x: nudged.x, y: nudged.y, tanDeg };
    }
    return { p, x: p.x, y: p.y, tanDeg };
  };

  while (arcPx <= arcEnd + 1e-3) {
    // along-path jitter as % of base step (in arc-length px)
    const jitterArcPx =
      (random01(opts.rng) * 2 - 1) * (jitterPct / 100) * baseStepPx;
    const sJitteredPx = clamp(arcPx + jitterArcPx, 0, arcEnd);

    const { p, x, y, tanDeg } = evalAtArcPx(sJitteredPx);

    for (let k = 0; k < stampsPerStep; k++) {
      // scatter normal to tangent
      const rad = (tanDeg * Math.PI) / 180;
      const nx = -Math.sin(rad);
      const ny = Math.cos(rad);
      const scatter =
        scatterPx > 0 ? (random01(opts.rng) * 2 - 1) * scatterPx : 0;
      const sx = x + nx * scatter;
      const sy = y + ny * scatter;

      const followAngle = followAmt * tanDeg;
      const jitter =
        angleJitterDeg > 0 ? (random01(opts.rng) * 2 - 1) * angleJitterDeg : 0;
      const angleDeg = followAngle + jitter;

      const tFrac = p.pathParam; // 0..1 along the stroke
      const widthScale = computeWidthScale(tFrac, opts);

      stamps.push({
        x: sx,
        y: sy,
        angleDeg,
        pressure: mapPressure(p.pressure, opts.pressureMap),
        t: tFrac,
        widthScale,
        tangentDeg: tanDeg,
      });
    }

    // step advance (true velocity if timestamps present, else spatial proxy)
    const s = clamp(arcPx / lengthPx, 0, 1);
    const seg = findSegmentAtParam(pts, s);
    const a = must(pts[seg.i0], `pts[${seg.i0}]`);
    const b = must(pts[seg.i1], `pts[${seg.i1}]`);
    const trueSpeedPxPerSec =
      typeof a.timeMs === "number" && typeof b.timeMs === "number"
        ? speedPxPerSecBetween(a, b)
        : length2D(subtract(b, a)); // proxy

    const localMeasure = trueSpeedPxPerSec;
    const stepPx =
      speedToSpacing !== 0
        ? modulateStepBySpeed(
            baseStepPx,
            localMeasure,
            speedToSpacing,
            minStepPx
          )
        : baseStepPx;

    arcPx += stepPx;
  }

  return stamps;
}

/* =============================================================================
 * Misc helpers (public)
 * ============================================================================= */

/** Map UI spacing (percent or fraction) to a safe fraction of diameter. */
export function resolveSpacingFraction(
  uiSpacing?: number,
  fallbackPct = 3
): number {
  const raw = typeof uiSpacing === "number" ? uiSpacing : fallbackPct;
  const frac = raw > 1 ? raw / 100 : raw;
  return Math.max(0.02, Math.min(0.08, frac));
}

/** Resample a stroke path at ~stepPx (CSS px) keeping pressure interpolated. */
export function resamplePath(
  points: ReadonlyArray<RenderPathPoint>,
  stepPx: number
): SamplePoint[] {
  const out: SamplePoint[] = [];
  if (!points || points.length < 2) return out;

  const raw: InternalPathSample[] = points.map((p) => ({
    x: Number.isFinite(p.x) ? p.x : 0,
    y: Number.isFinite(p.y) ? p.y : 0,
    pressure: Number.isFinite(p.pressure as number)
      ? (p.pressure as number)
      : 1,
    tangentDeg: Number.isFinite(p.angle as number)
      ? toDegrees(p.angle as number)
      : 0,
    pathParam: 0,
    ...(typeof p.t === "number" ? { timeMs: p.t as number } : {}),
  }));
  const { pts, lengthPx } = computePathLengthAndParam(raw);
  if (lengthPx <= 0) return out;

  const step = Math.max(0.3, Math.min(0.75, stepPx));

  const evalAtArcPx = (arcPx: number) => {
    const s = clamp(arcPx / lengthPx, 0, 1);
    const seg = findSegmentAtParam(pts, s);
    const a = must(pts[seg.i0], `pts[${seg.i0}]`);
    const b = must(pts[seg.i1], `pts[${seg.i1}]`);
    return interpolateSample(a, b, seg.u);
  };

  const first = evalAtArcPx(0);
  out.push({ x: first.x, y: first.y, t: 0, p: first.pressure });

  for (let s = step; s < lengthPx; s += step) {
    const p = evalAtArcPx(s);
    out.push({ x: p.x, y: p.y, t: p.pathParam, p: p.pressure });
  }
  const last = evalAtArcPx(lengthPx);
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

/* =============================================================================
 * Optional: One Euro filter (velocity/pressure smoothing)
 * ============================================================================= */

export type OneEuroParams = {
  minCutoff: number; // Hz
  beta: number; // responsiveness
  dCutoff: number; // Hz for derivative
};

class LowPass {
  private s = 0;
  private initialized = false;
  constructor(private alpha: number) {}
  setAlpha(a: number) {
    this.alpha = a;
  }
  filter(x: number): number {
    if (!this.initialized) {
      this.s = x;
      this.initialized = true;
      return x;
    }
    this.s = this.s + this.alpha * (x - this.s);
    return this.s;
  }
}

function alphaFromCutoff(cutoffHz: number, dtSec: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / Math.max(1e-6, dtSec));
}

export class OneEuro {
  private dx: LowPass;
  private x: LowPass;
  private lastTimeMs = 0;
  private lastX = 0;
  constructor(
    private params: OneEuroParams,
    initVal = 0,
    initTimeMs = 0
  ) {
    this.dx = new LowPass(1);
    this.x = new LowPass(1);
    this.lastTimeMs = initTimeMs;
    this.lastX = initVal;
    this.x.filter(initVal);
    this.dx.filter(0);
  }
  filter(xNew: number, timeMs: number): number {
    const dtSec = Math.max(1, timeMs - this.lastTimeMs) / 1000;
    this.lastTimeMs = timeMs;

    const dx = (xNew - this.lastX) / Math.max(1e-6, dtSec);
    this.lastX = xNew;

    this.dx.setAlpha(alphaFromCutoff(this.params.dCutoff, dtSec));
    const dxHat = this.dx.filter(dx);

    const cutoff = this.params.minCutoff + this.params.beta * Math.abs(dxHat);
    this.x.setAlpha(alphaFromCutoff(cutoff, dtSec));
    return this.x.filter(xNew);
  }
}

/** Smooth a series of scalar samples (e.g., raw speed or pressure) with timestamps. */
export function oneEuroSeries(
  samples: Array<{ v: number; tMs: number }>,
  params: OneEuroParams,
  initVal?: number
): number[] {
  const out: number[] = new Array(samples.length);
  const startVal = initVal ?? samples[0]?.v ?? 0;
  const startT = samples[0]?.tMs ?? 0;
  const f = new OneEuro(params, startVal, startT);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    out[i] = f.filter(s.v, s.tMs);
  }
  return out;
}
