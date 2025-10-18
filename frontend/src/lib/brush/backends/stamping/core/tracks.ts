// FILE: src/lib/brush/backends/stamping/core/tracks.ts

import { clamp } from "@backends/utils/math";

/* =============================================================================
 * Small utilities
 * ============================================================================= */

/** Unit outward normal for segment A→B (left-hand normal). */
export function segmentNormal(ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax,
    dy = by - ay;
  const L = Math.hypot(dx, dy) || 1;
  return { nx: -dy / L, ny: dx / L };
}

export type TrackCallback = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  meta: { index: number; sep: number; scatter: number }
) => void;

export type ForEachTrackOptions = {
  seed: number;
  splitCount: number;
  splitSpacing: number;
  splitSpacingJitter?: number;
  pressureToSplitSpacing?: number;
  splitCurvature?: number;
  splitAsymmetry?: number;
  splitScatter?: number;
  fanAngleRad?: number;
  tMid: number;
  pMid: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  cb: (ax: number, ay: number, bx: number, by: number) => void;
};

export function forEachTrackOpt(o: ForEachTrackOptions) {
  return forEachTrack(
    o.seed,
    o.splitCount,
    o.splitSpacing,
    o.splitSpacingJitter ?? 0,
    o.pressureToSplitSpacing ?? 0,
    o.splitCurvature ?? 0,
    o.splitAsymmetry ?? 0,
    o.splitScatter ?? 0,
    o.fanAngleRad ?? 0,
    o.tMid,
    o.pMid,
    o.ax,
    o.ay,
    o.bx,
    o.by,
    o.cb
  );
}

/** Tiny mulberry32 for stable, deterministic jitter (per track). */
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/* =============================================================================
 * Public types
 * ============================================================================= */

/** Options for computing lateral “fan” offsets around the center line. */
export type TrackFanOptions = Readonly<{
  /** Number of parallel tracks. Minimum 1. */
  count: number;
  /** Base half-spread in px (distance between adjacent tracks ≈ spreadPx). */
  spreadPx: number;
  /** Smile/frown curvature across the stroke, −1..+1 (default 0). */
  curvature?: number;
  /** Left/right asymmetry across tracks, −1..+1 (default 0). */
  asymmetry?: number;
}>;

/* =============================================================================
 * Fan offset helpers
 * ============================================================================= */

/**
 * Compute lateral offsets (in px) for a fan of `count` tracks centered on 0.
 * Offsets are signed distances applied along the local normal.
 * - `tMid` is 0..1 along the stroke (used for curvature shaping).
 */
export function trackOffsets(tMid: number, fan: TrackFanOptions): number[] {
  const n = Math.max(1, Math.floor(fan.count));
  const spread = Math.max(0, fan.spreadPx);
  const curvature = clamp(fan.curvature ?? 0, -1, 1);
  const asymmetry = clamp(fan.asymmetry ?? 0, -1, 1);

  const centerIndex = (n - 1) / 2;
  const out: number[] = new Array(n);

  // curvature scales offsets toward start vs end (−1..+1 over tMid)
  const curveGain = 1 + curvature * (2 * clamp(tMid, 0, 1) - 1);

  for (let k = 0; k < n; k++) {
    const base = spread * (k - centerIndex); // symmetric around zero
    const denom = centerIndex === 0 ? 1 : centerIndex;
    const asymGain = 1 + asymmetry * ((k - centerIndex) / denom);
    out[k] = base * curveGain * asymGain;
  }
  return out;
}

/* =============================================================================
 * Split-nib track dispatcher
 * ============================================================================= */

/**
 * Fan/offset multiple “split nib” tracks around the path’s normal
 * and invoke a callback per track. The callback receives the *offset* endpoints
 * for each track so your renderer can stroke/fill separately.
 *
 * @param seed  Stable seed for per-track randomization.
 * @param splitCount  Number of tracks.
 * @param splitSpacing  Baseline spacing between adjacent tracks (px).
 * @param splitSpacingJitter  0..1 percent jitter of spacing per track.
 * @param pressureToSplitSpacing  0..1 gain mapping pressure into spacing gain.
 * @param splitCurvature  −1..+1 “smile/frown” shaping across tMid.
 * @param splitAsymmetry  −1..+1 bias across left/right tracks.
 * @param splitScatter  Random normal scatter in px per track.
 * @param fanAngleRad  Rotate the fan around the normal by this angle (radians).
 * @param tMid  0..1 along stroke used for curvature shaping.
 * @param pMid  0..1 median pressure for this segment (widens/narrows the fan).
 * @param ax,ay,bx,by  Segment endpoints in CSS px.
 * @param cb   Callback invoked per track with offset endpoints.
 */
export function forEachTrack(
  seed: number,
  splitCount: number,
  splitSpacing: number,
  splitSpacingJitter: number, // 0..1
  pressureToSplitSpacing: number, // 0..1
  splitCurvature: number, // -1..+1
  splitAsymmetry: number, // -1..+1
  splitScatter: number, // px
  fanAngleRad: number, // radians
  tMid: number, // 0..1 along stroke
  pMid: number, // 0..1 pressure
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cb: (ax: number, ay: number, bx: number, by: number) => void
): void {
  const { nx, ny } = segmentNormal(ax, ay, bx, by);

  // rotate the normal by fan angle for a “chisel” fan
  const c = Math.cos(fanAngleRad);
  const s = Math.sin(fanAngleRad);
  const rx = c * nx - s * ny;
  const ry = s * nx + c * ny;

  const centerIndex = (splitCount - 1) / 2;

  for (let k = 0; k < splitCount; k++) {
    const rand = mulberry32((seed ^ 0x1000) + k * 97);

    // base separation for track k relative to center
    const baseSep = splitSpacing * (k - centerIndex);

    // jitter around baseSep
    const jitterPct = clamp(splitSpacingJitter, 0, 1);
    const jitteredSep = baseSep * (1 + (rand() * 2 - 1) * jitterPct);

    // pressure widens/narrows the fan (map pressure 0..1 to gain 1±)
    const pressGain = 1 + pressureToSplitSpacing * ((pMid - 0.5) * 2);

    // slight “smile/frown” curvature along the stroke
    const curveGain =
      1 + clamp(splitCurvature, -1, 1) * (2 * clamp(tMid, 0, 1) - 1);

    // asymmetry across tracks: push one side more than the other
    const denom = centerIndex === 0 ? 1 : centerIndex;
    const asymGain =
      1 + clamp(splitAsymmetry, -1, 1) * ((k - centerIndex) / denom);

    const sep = jitteredSep * pressGain * curveGain * asymGain;

    // random normal scatter (grainy split)
    const scatter = splitScatter > 0 ? (rand() * 2 - 1) * splitScatter : 0;

    const ox = rx * sep + nx * scatter;
    const oy = ry * sep + ny * scatter;

    cb(ax + ox, ay + oy, bx + ox, by + oy);
  }
}
