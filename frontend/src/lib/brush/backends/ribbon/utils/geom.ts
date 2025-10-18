// FILE: src/lib/brush/backends/ribbon/utils/geom.ts

/** Small numeric epsilon to avoid divide-by-zero. */
export const EPS = 1e-6;

export type XY = { x: number; y: number };

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamp to [0,1]. */
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Vector length (hypotenuse). */
export function len(dx: number, dy: number): number {
  return Math.hypot(dx, dy);
}

/** Euclidean distance between two points. */
export function dist(a: XY, b: XY): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Normalize (dx,dy). Returns a unit vector; if near-zero,
 * returns (0,0) to avoid NaN.
 */
export function norm(dx: number, dy: number): XY {
  const m = Math.hypot(dx, dy);
  if (m <= EPS) return { x: 0, y: 0 };
  const inv = 1 / m;
  return { x: dx * inv, y: dy * inv };
}

/**
 * Tangent direction from point a to b (unit vector).
 * If a==b, returns (0,0).
 */
export function tangent(a: XY, b: XY): XY {
  return norm(b.x - a.x, b.y - a.y);
}

/**
 * Left-hand normal (perpendicular) of a direction vector (dx,dy), unit length.
 * If (dx,dy)≈(0,0), returns (0,0).
 *
 * For right-hand normal, negate the result.
 */
export function normal(dx: number, dy: number): XY {
  // Left normal of (dx,dy) is (-dy, +dx)
  const nx = -dy;
  const ny = dx;
  return norm(nx, ny);
}
