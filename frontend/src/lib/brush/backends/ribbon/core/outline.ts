// FILE: src/lib/brush/backends/ribbon/core/outline.ts
import type { Ctx2D } from "@backends/utils/canvas";

/** Minimal sample type the outline builder expects (kept local to avoid name clash). */
export type RibbonOutlineSample = {
  x: number; // CSS px
  y: number; // CSS px
  angleRad: number; // path heading (radians)
  arcLen: number; // cumulative arc length (px)
  t: number; // 0..1 along the whole stroke
};

/**
 * Convert generic resampled points (with optional .angle/.t) into
 * RibbonOutlineSample[]. Accepts any {x,y, angle?, t?}.
 *
 * - If .angle is missing, it’s inferred from neighbors.
 * - If .t is missing, it’s computed from cumulative arclength.
 */
export function toOutlineSamples(
  pts: ReadonlyArray<{ x: number; y: number; angle?: number; t?: number }>
): RibbonOutlineSample[] {
  const n = pts.length;
  if (n < 2) return [];

  // 1) cumulative arclength
  const arc: number[] = new Array(n);
  let acc = 0;
  arc[0] = 0;

  for (let i = 1; i < n; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    acc += Math.hypot(b.x - a.x, b.y - a.y);
    arc[i] = acc;
  }

  const total = arc[n - 1] || 1;

  // 2) angle per sample (use provided .angle if present, else infer)
  const ang: number[] = new Array(n);
  const infer = (i: number): number => {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(n - 1, i + 1)]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    return len > 1e-6 ? Math.atan2(dy, dx) : 0;
  };
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    ang[i] = typeof a.angle === "number" ? a.angle : infer(i);
  }

  // 3) normalized t (use given, otherwise derive from arclength)
  const out: RibbonOutlineSample[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    const tNorm =
      typeof p.t === "number"
        ? Math.max(0, Math.min(1, p.t))
        : Math.max(0, Math.min(1, arc[i]! / total));
    out[i] = {
      x: p.x,
      y: p.y,
      angleRad: ang[i]!,
      arcLen: arc[i]!,
      t: tNorm,
    };
  }
  return out;
}

/**
 * Build a Path2D outline for a ribbon by offsetting each sample point by
 * the local outward normal * radiusAt(arcLen|t).
 *
 * radiusAt: either a function of arcLen or (t) — your lambda can use either.
 */
export function buildRibbonOutline(
  samples: ReadonlyArray<RibbonOutlineSample>,
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
export function withRibbonClip(ctx: Ctx2D, outline: Path2D, body: () => void) {
  ctx.save();
  ctx.clip(outline);
  body();
  ctx.restore();
}
