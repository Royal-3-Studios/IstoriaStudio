// FILE: src/lib/brush/backends/utils/input.ts
/**
 * Shared input helpers for all backends.
 * - Normalizes pressure (`p|pressure`) to [0..1]
 * - Optional tilt extraction (altitude/azimuth) without assumptions
 * - Angle helpers from neighboring points
 * - Pressure → size/flow convenience scalars
 * - Spacing pickers (reads from extra.strokePath if present)
 * - Seeded RNG bootstrap (mulberry32)
 *
 * Designed to be exactOptionalPropertyTypes-safe: no writes of `undefined`.
 */

import { mulberry32, type RNG } from "@backends/utils/random";

/* --------------------------------- Types ---------------------------------- */

export type PathPoint = {
  x: number;
  y: number;
  /** Preferred: normalized [0..1]. We accept either `p` or `pressure`. */
  p?: number;
  pressure?: number;

  /** Optional path-tangent angle in radians (stroke direction). */
  angle?: number;

  /** Optional tilt — flexible input shape (see getTilt). */
  tilt?: number | { altitude?: number; azimuth?: number };

  /** Optional timestamp. */
  t?: number;

  /** Optional stylus tilt components (if provided separately). */
  tiltAltitude?: number;
  tiltAzimuth?: number;
};

export type StrokePath = ReadonlyArray<PathPoint>;

/** Narrow type for the `extra` bag passed through adapters. */
export type AdapterExtra =
  | {
      overrides?: { flow?: number } & Record<string, unknown>;
      strokePath?: { spacing?: number } & Record<string, unknown>;
      shape?: Record<string, unknown>;
      rendering?: Record<string, unknown>;
      grain?: Record<string, unknown>;
    }
  | undefined;

/* --------------------------------- Math ----------------------------------- */

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/* ----------------------------- Pressure utils ----------------------------- */

/** Returns normalized pressure in [0..1]. Falls back to 1 if absent. */
export function getPressure(pt: PathPoint): number {
  const raw =
    typeof pt.p === "number"
      ? pt.p
      : typeof pt.pressure === "number"
        ? pt.pressure
        : 1;
  // Some devices report 0..1024, some 0..4096 — clamp anyway.
  return clamp01(raw <= 1 ? raw : raw / 4096);
}

/** Maps pressure to a size scale and multiplies with base size (px). */
export function pressureToSize(
  baseSizePx: number,
  p: number,
  opts?: {
    /** Minimum scale @ p=0 (default 0.5) */
    minScale?: number;
    /** Maximum scale @ p=1 (default 1.0) */
    maxScale?: number;
  }
): number {
  const minS = opts?.minScale ?? 0.5;
  const maxS = opts?.maxScale ?? 1.0;
  const scale = lerp(minS, maxS, clamp01(p));
  return Math.max(0.01, baseSizePx * scale);
}

/**
 * Maps pressure to a flow/alpha multiplier.
 * - `flowOverride` is 0..100 (like Procreate/Photoshop style "flow" slider)
 * - Output is [0..1], combining override and pressure shaping.
 */
export function pressureToFlow(
  flowOverride: number | undefined,
  p: number,
  opts?: {
    /** Baseline at p=0 (default 0.25 so low pressure still lays a tiny amount) */
    minAtZero?: number;
    /** Curve strength (default 0.75; 0 = flat, 1 = mostly pressure-driven) */
    curve?: number;
  }
): number {
  const min0 = opts?.minAtZero ?? 0.25;
  const k = opts?.curve ?? 0.75;
  const shaped = clamp01(min0 + k * clamp01(p));
  const flow =
    (typeof flowOverride === "number" ? clamp01(flowOverride / 100) : 1) *
    shaped;
  return clamp01(flow);
}

/* ------------------------------- Tilt utils ------------------------------- */

/**
 * Extracts tilt in radians if available.
 * Accepts any of:
 *  - pt.tilt as number → interpreted as altitude
 *  - pt.tilt as { altitude?, azimuth? }
 *  - separate pt.tiltAltitude / pt.tiltAzimuth
 *
 * Returns an object that *omits* keys when values aren't present,
 * which keeps us safe under `exactOptionalPropertyTypes`.
 */
export function getTilt(pt: PathPoint): {
  altitude?: number;
  azimuth?: number;
} {
  let altitude: number | undefined;
  let azimuth: number | undefined;

  if (typeof pt.tilt === "number") {
    altitude = pt.tilt;
  } else if (pt.tilt && typeof pt.tilt === "object") {
    if (typeof pt.tilt.altitude === "number") altitude = pt.tilt.altitude;
    if (typeof pt.tilt.azimuth === "number") azimuth = pt.tilt.azimuth;
  }
  if (typeof pt.tiltAltitude === "number") altitude = pt.tiltAltitude;
  if (typeof pt.tiltAzimuth === "number") azimuth = pt.tiltAzimuth;

  const out: { altitude?: number; azimuth?: number } = {};
  if (typeof altitude === "number") out.altitude = altitude;
  if (typeof azimuth === "number") out.azimuth = azimuth;
  return out; // may be {} if neither present
}

/* ------------------------------- Angle utils ------------------------------ */

/**
 * Returns stroke tangent angle (radians) at index `i`.
 * Prefers pt.angle if provided; otherwise computes from neighbors.
 */
export function getPathAngle(path: StrokePath, i: number): number {
  const pt = path[i]!;
  if (typeof pt.angle === "number") return pt.angle;

  const prev = path[i - 1] ?? pt;
  const next = path[i + 1] ?? pt;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  if (dx === 0 && dy === 0) return 0;
  return Math.atan2(dy, dx);
}

/* ------------------------------ Spacing utils ----------------------------- */

/** Picks stamp spacing (in CSS pixels along the stroke). */
export function pickSpacing(extra: AdapterExtra, fallback = 2): number {
  const s = extra?.strokePath?.spacing;
  return typeof s === "number" && s > 0 ? s : fallback;
}

/* ------------------------------- RNG helper ------------------------------- */

/** Returns a seeded RNG (mulberry32) for consistent strokes. */
export function getRng(seed: number | undefined): RNG {
  return mulberry32(typeof seed === "number" ? seed : 1);
}

/* --------------------------- Path normalization --------------------------- */

/**
 * Returns a lightweight normalized copy of a path with:
 *  - `pressure` guaranteed in [0..1]
 *  - `angle` filled if missing
 * Callers can map on demand to avoid allocations if they prefer.
 */
// ⬇️ replace your normalizePath with this version
export function normalizePath(src: StrokePath): ReadonlyArray<
  // Rebuild the exact optional property types: tilt must *not* include undefined
  Omit<PathPoint, "p" | "pressure" | "angle" | "tilt"> & {
    pressure: number;
    angle: number;
    tilt?: Exclude<PathPoint["tilt"], undefined>;
  }
> {
  type OutItem = Omit<PathPoint, "p" | "pressure" | "angle" | "tilt"> & {
    pressure: number;
    angle: number;
    tilt?: Exclude<PathPoint["tilt"], undefined>;
  };

  const n = src.length;
  const out: OutItem[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const pt = src[i]!; // safe: i < n
    const pressure = getPressure(pt);
    const angle = getPathAngle(src, i);

    out[i] = {
      x: pt.x,
      y: pt.y,
      pressure,
      angle,
      ...(typeof pt.t === "number" ? { t: pt.t } : {}),
      // only attach tilt when present — and it will be the non-undefined subtype
      ...(pt.tilt !== undefined ? { tilt: pt.tilt } : {}),
      ...(typeof pt.tiltAltitude === "number"
        ? { tiltAltitude: pt.tiltAltitude }
        : {}),
      ...(typeof pt.tiltAzimuth === "number"
        ? { tiltAzimuth: pt.tiltAzimuth }
        : {}),
    };
  }

  return out;
}
