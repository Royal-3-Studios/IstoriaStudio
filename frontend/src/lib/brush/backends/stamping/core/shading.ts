// FILE: src/lib/brush/backends/stamping/core/shading.ts
import type { Ctx2D } from "@backends/utils/canvas";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export type BandOpts = {
  /** Stroke width in px. */
  lineWidth: number;
  /** Opacity 0..1. */
  alpha: number;
  /** Blend mode (defaults to "multiply"). */
  composite?: GlobalCompositeOperation;
  /** Optional Canvas2D blur (px). */
  blurPx?: number;
  /** Stroke color (CSS). */
  color: string;
  /** Optional caps/joins (default "round"). */
  lineCap?: CanvasLineCap;
  lineJoin?: CanvasLineJoin;
};

/** Draw a blurred stroke band along a center polyline. */
export function strokeBand(
  ctx: Ctx2D,
  pts: ReadonlyArray<{ x: number; y: number }>,
  opts: BandOpts
): void {
  if (!pts || pts.length < 2) return;

  const {
    lineWidth,
    alpha,
    composite = "multiply",
    blurPx = 0,
    color,
    lineCap = "round",
    lineJoin = "round",
  } = opts;

  const c = ctx as CanvasRenderingContext2D;

  ctx.save();
  try {
    // filter (supported in modern Canvas2D)
    c.filter = blurPx > 0 ? `blur(${Math.max(0, blurPx)}px)` : "none";

    ctx.globalCompositeOperation = composite;
    ctx.globalAlpha = clamp01(alpha);

    c.strokeStyle = color;
    c.lineCap = lineCap;
    c.lineJoin = lineJoin;
    c.lineWidth = Math.max(0.5, lineWidth);

    c.beginPath();
    c.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i]!.x, pts[i]!.y);
    c.stroke();
  } finally {
    ctx.restore();
  }
}

/**
 * Destination-in tip fade between endpoints.
 * Uses a linear gradient mask in the stroke direction; fills the whole view box.
 */
export function applyTipFade(
  ctx: Ctx2D,
  start: { x: number; y: number },
  end: { x: number; y: number },
  tipMinAlpha: number,
  viewW: number,
  viewH: number
): void {
  const c = ctx as CanvasRenderingContext2D;
  const a = clamp01(tipMinAlpha);

  ctx.save();
  try {
    ctx.globalCompositeOperation = "destination-in";

    const g = c.createLinearGradient(start.x, start.y, end.x, end.y);
    // Soft tips: faint at ends, opaque across the body.
    g.addColorStop(0.0, `rgba(0,0,0,${a.toFixed(3)})`);
    g.addColorStop(0.08, "rgba(0,0,0,1.0)");
    g.addColorStop(0.92, "rgba(0,0,0,1.0)");
    g.addColorStop(1.0, `rgba(0,0,0,${a.toFixed(3)})`);

    c.fillStyle = g;
    c.fillRect(0, 0, Math.max(1, viewW), Math.max(1, viewH));
  } finally {
    ctx.restore();
  }
}
