// FILE: src/lib/brush/backends/stamping/core/shading.ts
import type { Ctx2D } from "@backends/utils/canvas";

export type BandOpts = {
  lineWidth: number;
  alpha: number;
  composite?: GlobalCompositeOperation;
  blurPx?: number;
  color: string;
};

/** Draw a blurred stroke band along a center polyline. */
export function strokeBand(
  ctx: Ctx2D,
  pts: ReadonlyArray<{ x: number; y: number }>,
  opts: BandOpts
): void {
  if (pts.length < 2) return;
  const { lineWidth, alpha, composite = "multiply", blurPx = 0, color } = opts;

  const prev = ctx.filter;
  (ctx as CanvasRenderingContext2D).filter =
    blurPx > 0 ? `blur(${blurPx}px)` : "none";

  const prevComp = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = composite;

  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha;

  (ctx as CanvasRenderingContext2D).strokeStyle = color;
  (ctx as CanvasRenderingContext2D).lineCap = "round";
  (ctx as CanvasRenderingContext2D).lineJoin = "round";
  (ctx as CanvasRenderingContext2D).lineWidth = Math.max(0.5, lineWidth);

  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.stroke();

  ctx.globalAlpha = prevAlpha;
  ctx.globalCompositeOperation = prevComp;
  (ctx as CanvasRenderingContext2D).filter = prev;
}

/** Destination-in tip fade between endpoints. */
export function applyTipFade(
  ctx: Ctx2D,
  start: { x: number; y: number },
  end: { x: number; y: number },
  tipMinAlpha: number,
  viewW: number,
  viewH: number
): void {
  const a = Math.max(0, Math.min(1, tipMinAlpha));
  const prevComp = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "destination-in";

  const g = (ctx as CanvasRenderingContext2D).createLinearGradient(
    start.x,
    start.y,
    end.x,
    end.y
  );
  g.addColorStop(0.0, `rgba(0,0,0,${a.toFixed(2)})`);
  g.addColorStop(0.08, "rgba(0,0,0,1.0)");
  g.addColorStop(0.92, "rgba(0,0,0,1.0)");
  g.addColorStop(1.0, `rgba(0,0,0,${a.toFixed(2)})`);

  (ctx as CanvasRenderingContext2D).fillStyle = g;
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.globalCompositeOperation = prevComp;
}
