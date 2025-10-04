// FILE: src/lib/brush/backends/ribbon/core/outline.ts
import type { Ctx2D } from "../../utils/canvas";

/** Minimal sample type the outline builder expects. */
export type RibbonSample = {
  x: number; // CSS px
  y: number; // CSS px
  angleRad: number; // path heading (radians)
  arcLen: number; // cumulative arc length (px)
  t: number; // 0..1 along the whole stroke
};

/**
 * Build a Path2D outline for a ribbon by offsetting each sample point by
 * the local outward normal * radiusAt(arcLen|t).
 *
 * radiusAt: either a function of arcLen or (t) — you can choose which to use
 * in your lambda. For clarity we pass both.
 */
export function buildRibbonOutline(
  samples: ReadonlyArray<RibbonSample>,
  radiusAt: (arcLen: number, t: number) => number
): Path2D {
  const n = samples.length;
  if (n < 2) return new Path2D();

  // Precompute left/right offsets
  const left: Array<{ x: number; y: number }> = new Array(n);
  const right: Array<{ x: number; y: number }> = new Array(n);

  for (let i = 0; i < n; i++) {
    const cur = samples[i]!;
    const prev = samples[i > 0 ? i - 1 : i]!;
    const next = samples[i < n - 1 ? i + 1 : i]!;

    // Smooth heading by averaging neighbors; fall back to cur.angleRad.
    const ang = (prev.angleRad + cur.angleRad + next.angleRad) / 3;
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);

    const r = Math.max(0, radiusAt(cur.arcLen, cur.t));
    left[i] = { x: cur.x - nx * r, y: cur.y - ny * r };
    right[i] = { x: cur.x + nx * r, y: cur.y + ny * r };
  }

  const path = new Path2D();
  path.moveTo(left[0]!.x, left[0]!.y);
  for (let i = 1; i < n; i++) path.lineTo(left[i]!.x, left[i]!.y);
  for (let i = n - 1; i >= 0; i--) path.lineTo(right[i]!.x, right[i]!.y);
  path.closePath();
  return path;
}

/** Optional helper: clip to a ribbon outline and run a drawing body. */
export function withRibbonClip(
  ctx: Ctx2D,
  outline: Path2D,
  body: () => void
): void {
  ctx.save();
  ctx.clip(outline);
  body();
  ctx.restore();
}
