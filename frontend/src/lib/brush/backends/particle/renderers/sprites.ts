import type { Ctx2D } from "@backends/utils/canvas";

export function drawDisc(
  ctx: Ctx2D,
  x: number,
  y: number,
  r: number,
  alpha: number
): void {
  if (alpha <= 0 || r <= 0) return;
  const c2d = ctx as CanvasRenderingContext2D;
  c2d.save();
  c2d.globalAlpha = Math.max(0, Math.min(1, alpha));
  c2d.beginPath();
  c2d.arc(x, y, r, 0, Math.PI * 2, false);
  c2d.fill();
  c2d.restore();
}
