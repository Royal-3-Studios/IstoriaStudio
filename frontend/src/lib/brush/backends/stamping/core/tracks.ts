// FILE: src/lib/brush/backends/stamping/core/tracks.ts
import { clamp } from "@backends/utils/math";

/** Unit outward normal for segment A→B. */
function segmentNormal(ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax,
    dy = by - ay;
  const L = Math.hypot(dx, dy) || 1;
  return { nx: -dy / L, ny: dx / L };
}

/** Tiny mulberry32 for stable per-track jitter. */
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

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

/**
 * Compute lateral offsets (in px) for a fan of `count` tracks centered on 0.
 * Offsets are signed distances applied along the local normal.
 * - `tMid` is 0..1 along the stroke (used for curvature shaping).
 */
export function trackOffsets(tMid: number, fan: TrackFanOptions): number[] {
  const n = Math.max(1, Math.floor(fan.count));
  const spread = Math.max(0, fan.spreadPx);
  const curv = clamp(fan.curvature ?? 0, -1, 1);
  const asym = clamp(fan.asymmetry ?? 0, -1, 1);

  const center = (n - 1) / 2;
  const out: number[] = new Array(n);

  // curvature scales offsets toward start vs end (−1..+1 over tMid)
  const kCurve = 1 + curv * (2 * clamp(tMid, 0, 1) - 1);

  for (let k = 0; k < n; k++) {
    const base = spread * (k - center); // symmetric
    const denom = center === 0 ? 1 : center;
    const kAsym = 1 + asym * ((k - center) / denom);
    out[k] = base * kCurve * kAsym;
  }
  return out;
}

/**
 * Fan/offset multiple “split nib” tracks around the path’s normal
 * and invoke a callback per track.
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

  const center = (splitCount - 1) / 2;
  for (let k = 0; k < splitCount; k++) {
    const rand = mulberry32((seed ^ 0x1000) + k * 97);

    const baseSep = splitSpacing * (k - center);

    // jitter around baseSep
    const jittered =
      baseSep * (1 + (rand() * 2 - 1) * clamp(splitSpacingJitter, 0, 1));

    // pressure widens/narrows the fan
    const pressSep = 1 + pressureToSplitSpacing * ((pMid - 0.5) * 2);

    // slight “smile/frown” curvature along the stroke
    const curve = 1 + clamp(splitCurvature, -1, 1) * (2 * tMid - 1);

    // asymmetry across tracks
    const denom = center === 0 ? 1 : center;
    const asym = 1 + clamp(splitAsymmetry, -1, 1) * ((k - center) / denom);

    const sep = jittered * pressSep * curve * asym;

    // random normal scatter
    const sc = splitScatter > 0 ? (rand() * 2 - 1) * splitScatter : 0;

    const ox = rx * sep + nx * sc;
    const oy = ry * sep + ny * sc;

    cb(ax + ox, ay + oy, bx + ox, by + oy);
  }
}
