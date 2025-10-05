import type { Ctx2D, CanvasLike } from "@backends/utils/canvas";
import { createLayer, get2D } from "@backends/utils/canvas";
import { falloffGaussian, falloffCosine } from "./kernel";

/**
 * Drag/smear implementation:
 * - samples the source canvas within a circular clip at the stamp position
 * - applies a translation along the previous step vector (scaled by strength)
 */
export function dragStamp(
  destCtx: Ctx2D,
  srcCanvas: CanvasLike,
  cx: number,
  cy: number,
  radiusPx: number,
  offsetX: number,
  offsetY: number,
  opts: {
    alpha: number; // 0..1
    softenPx: number; // px blur filter
    falloff: "gaussian" | "cosine";
    anisotropy: number; // 0..1
    alignWithTangent: number; // 0..1
    tangentDeg: number;
  }
): void {
  const r = Math.max(0.5, radiusPx);
  const alpha = Math.max(0, Math.min(1, opts.alpha));
  if (alpha <= 0) return;

  destCtx.save();

  // blur softening
  const any = destCtx as CanvasRenderingContext2D;
  if (typeof any.filter === "string" && opts.softenPx > 0.01) {
    any.filter = `blur(${opts.softenPx.toFixed(3)}px)`;
  }

  // Clip a circle, then draw the source with an offset
  destCtx.globalAlpha = alpha;
  destCtx.beginPath();
  destCtx.arc(cx, cy, r, 0, Math.PI * 2);
  destCtx.clip();

  // Optional falloff: draw into a temp radial mask and use destination-in
  const fall = opts.falloff === "cosine" ? falloffCosine : falloffGaussian;
  const w = Math.ceil(r * 2),
    h = Math.ceil(r * 2);
  const mask = createLayer(w, h);
  const mx = get2D(mask);
  const midx = w >> 1,
    midy = h >> 1;
  const id = mx.createImageData(w, h);
  const data = id.data;
  for (let y = 0, k = 0; y < h; y++) {
    const dy = (y - midy) / r;
    for (let x = 0; x < w; x++, k += 4) {
      const dx = (x - midx) / r;
      const rr = Math.hypot(dx, dy);
      const ww = Math.max(0, Math.min(1, fall(rr)));
      data[k + 0] = 0;
      data[k + 1] = 0;
      data[k + 2] = 0;
      data[k + 3] = Math.round(255 * ww);
    }
  }
  mx.putImageData(id, 0, 0);

  // Draw the underlying source shifted by (offsetX, offsetY)
  destCtx.drawImage(srcCanvas, -offsetX, -offsetY);

  // Apply radial falloff mask
  destCtx.globalCompositeOperation = "destination-in";
  destCtx.drawImage(mask, cx - r, cy - r);
  destCtx.globalCompositeOperation = "source-over";

  // clear filter
  if (typeof any.filter === "string") any.filter = "none";
  destCtx.restore();
}
