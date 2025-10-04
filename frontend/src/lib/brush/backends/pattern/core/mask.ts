// FILE: src/lib/brush/backends/pattern/core/mask.ts

import type { Ctx2D, CanvasLike } from "../utils/canvas";
import { createLayer, get2D } from "../utils/canvas";

export function newMask(
  width: number,
  height: number
): { mask: CanvasLike; mx: Ctx2D } {
  const mask = createLayer(width, height);
  const mx = get2D(mask);
  mx.clearRect(0, 0, width, height);
  return { mask, mx };
}

export function newColorLayer(
  width: number,
  height: number
): { colorLayer: CanvasLike; cx: Ctx2D } {
  const colorLayer = createLayer(width, height);
  const cx = get2D(colorLayer);
  cx.clearRect(0, 0, width, height);
  return { colorLayer, cx };
}

/** Keep color where mask exists. */
export function clipColorByMask(destCtx: Ctx2D, mask: CanvasLike): void {
  destCtx.save();
  destCtx.globalCompositeOperation = "destination-in";
  destCtx.drawImage(mask, 0, 0);
  destCtx.restore();
}

/** Multiply grain into color layer. */
export function multiplyOver(destCtx: Ctx2D, src: CanvasLike, alpha = 1): void {
  destCtx.save();
  destCtx.globalAlpha = alpha;
  destCtx.globalCompositeOperation = "multiply";
  destCtx.drawImage(src, 0, 0);
  destCtx.restore();
}
