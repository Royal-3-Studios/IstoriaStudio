// FILE: src/lib/brush/backends/pattern/core/draw.ts

import type { Ctx2D, CanvasLike } from "../utils/canvas";
import { createLayer, get2D } from "../utils/canvas";

/** Multiply+alpha composite helper. */
export function drawMultiplyAlpha(
  dest: Ctx2D,
  src: CanvasLike,
  alpha: number,
  composite: GlobalCompositeOperation = "multiply"
): void {
  dest.save();
  dest.globalCompositeOperation = composite;
  dest.globalAlpha = Math.max(0, Math.min(1, alpha));
  dest.drawImage(src, 0, 0);
  dest.restore();
}

/** Make an ImageData from a CanvasLike. */
export function toImageData(layer: CanvasLike): ImageData {
  const w = (layer as HTMLCanvasElement | OffscreenCanvas).width;
  const h = (layer as HTMLCanvasElement | OffscreenCanvas).height;
  const cx = get2D(layer);
  return cx.getImageData(0, 0, w, h);
}

/** Render a tile canvas as a repeated pattern onto a target ctx in a rect. */
export function fillPatternRect(
  ctx: Ctx2D,
  tile: CanvasLike,
  dstW: number,
  dstH: number,
  alpha = 1,
  composite: GlobalCompositeOperation = "multiply"
): void {
  const pat = (ctx as CanvasRenderingContext2D).createPattern(
    tile as unknown as CanvasImageSource,
    "repeat"
  );
  if (!pat) return;
  ctx.save();
  ctx.globalCompositeOperation = composite;
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  (ctx as CanvasRenderingContext2D).fillStyle = pat;
  ctx.fillRect(0, 0, dstW, dstH);
  ctx.restore();
}

/** Convenience: colored base layer + multiplied pattern on top. */
export function colorThenPattern(
  w: number,
  h: number,
  color: string,
  tile: CanvasLike,
  alpha: number,
  composite: GlobalCompositeOperation
): CanvasLike {
  const layer = createLayer(w, h);
  const lx = get2D(layer);
  lx.clearRect(0, 0, w, h);
  lx.save();
  (lx as CanvasRenderingContext2D).fillStyle = color;
  lx.fillRect(0, 0, w, h);
  lx.restore();
  fillPatternRect(lx, tile, w, h, alpha, composite);
  return layer;
}
