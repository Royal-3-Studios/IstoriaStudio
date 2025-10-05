// FILE: src/lib/brush/backends/stamping/core/width.ts
import { clamp } from "@backends/utils/math";
import { computeWidthScale, type TaperProfile } from "@backends/utils/stroke";

export type WidthOpts = {
  /** Brush diameter in CSS px (paired with baseRadius input). */
  baseSizePx: number;

  /** Minimum tip width in px (applied after scale). */
  tipMinPx?: number;

  /** Push thickness toward uniform marker look (0..1). */
  uniformity?: number;

  /** Asymmetric body shaping: -1..+1 makes end thicker/thinner. */
  endBias?: number;

  /** How the START tip narrows (0..1). */
  tipScaleStart?: number;

  /** How the END tip narrows (0..1). */
  tipScaleEnd?: number;

  /** Profile shapes for start and end taper. */
  taperProfileStart?: TaperProfile;
  taperProfileEnd?: TaperProfile;
};

/**
 * Convert width scale (from taper/body shaping) into a pixel width,
 * lightly modulated by pressure. Returns **width** (not radius).
 */
export function widthPxFromScale(
  baseRadius: number, // radius in px
  t: number, // 0..1 along path
  pressure01: number, // 0..1
  opts: WidthOpts,
  tipMinPx: number
): number {
  // Build a minimal option object for computeWidthScale using strict types.
  // (spacingPercent is unused by computeWidthScale, but the type in stroke.ts
  // expects it — provide a safe nominal value.)
  const scale = computeWidthScale(t, {
    baseSizePx: Math.max(1, Math.floor(opts.baseSizePx)), // required by type
    spacingPercent: 6, // safe nominal
    uniformity: opts.uniformity ?? 0,
    endBias: opts.endBias ?? 0,
    tipScaleStart: opts.tipScaleStart ?? 0.85,
    tipScaleEnd: opts.tipScaleEnd ?? 0.85,
    taperProfileStart: opts.taperProfileStart ?? "linear",
    taperProfileEnd: opts.taperProfileEnd ?? "linear",
  });

  // Pressure widens slightly (gentle curve that feels natural for pencil/ink).
  const p = clamp(pressure01, 0, 1);
  const pressureK = 0.35 + Math.pow(p, 0.65) * 0.45;

  const r = Math.max(0.5, baseRadius * scale * pressureK);
  return Math.max(tipMinPx, r * 2); // return **width** in px
}
