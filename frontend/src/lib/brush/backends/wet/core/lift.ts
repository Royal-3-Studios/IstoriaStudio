import type { Ctx2D } from "@backends/utils/canvas";

/** Lift pigment from `target` by subtracting (destination-out) a blurred water mask. */
export function applyLift(
  target: OffscreenCanvas | HTMLCanvasElement,
  waterMask: OffscreenCanvas | HTMLCanvasElement,
  strength01: number
): void {
  const w = (target as HTMLCanvasElement | OffscreenCanvas).width;
  const h = (target as HTMLCanvasElement | OffscreenCanvas).height;
  if (w <= 0 || h <= 0) return;

  const ctx = target.getContext("2d", { alpha: true }) as Ctx2D | null;
  if (!ctx) return;

  const a = Math.max(0, Math.min(1, strength01));
  if (a <= 0) return;

  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.globalAlpha = a;
  // Draw/scale the water mask to the target’s size
  ctx.drawImage(waterMask, 0, 0, w, h);
  ctx.restore();
}
