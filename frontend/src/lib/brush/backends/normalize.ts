// FILE: src/lib/brush/backends/normalize.ts
import type { RenderStrokePoint } from "./types";
import type { RenderPathPoint } from "@/lib/brush/engine";

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Convert external stroke points to engine points.
 * - Guarantees x,y are numbers (skips invalid points)
 * - Fills both p and pressure with a concrete number
 * - Adds optional fields (angle/tilt/t) only when defined
 */
export function toEnginePath(
  points?: ReadonlyArray<RenderStrokePoint>
): RenderPathPoint[] {
  const out: RenderPathPoint[] = [];
  for (const pt of points ?? []) {
    // Require numeric x/y
    if (!isFiniteNumber(pt.x) || !isFiniteNumber(pt.y)) continue;
    const x = pt.x as number;
    const y = pt.y as number;

    // Resolve pressure with a hard default (1 = firm press)
    const p = isFiniteNumber(pt.p)
      ? (pt.p as number)
      : isFiniteNumber(pt.pressure)
        ? (pt.pressure as number)
        : 1;

    const outPt: RenderPathPoint = { x, y, p, pressure: p };

    // Only attach optionals when present (avoids writing `undefined`)
    if (isFiniteNumber(pt.angle)) outPt.angle = pt.angle as number;
    if (isFiniteNumber(pt.tilt)) outPt.tilt = pt.tilt as number;
    if (isFiniteNumber(pt.t)) outPt.t = pt.t as number;

    out.push(outPt);
  }
  return out;
}

/**
 * Prefer explicit pixelRatio, fall back to `dpr`, else `undefined`
 * (call sites should conditionally include this value).
 */
export function pickPixelRatio(opts: {
  pixelRatio?: number;
  dpr?: number;
}): number | undefined {
  if (isFiniteNumber(opts.pixelRatio)) return opts.pixelRatio;
  if (isFiniteNumber(opts.dpr)) return opts.dpr; // legacy alias
  return undefined;
}
