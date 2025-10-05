// src/lib/brush/backends/spray/core/mask.ts
import type { Ctx2D } from "@backends/utils/canvas";
import { Blend, CanvasUtil } from "@backends";
import { createLayer, get2D } from "@backends/utils/canvas";

export function newMask(width: number, height: number) {
  const mask = createLayer(width, height);
  const mx = get2D(mask);
  mx.clearRect(0, 0, width, height);
  mx.globalCompositeOperation = "source-over";
  return { mask, mx };
}

export function newColorLayer(width: number, height: number) {
  const colorLayer = createLayer(width, height);
  const cx = get2D(colorLayer);
  cx.clearRect(0, 0, width, height);
  return { colorLayer, cx };
}

/** Clip color into mask α. */
export function clipColorByMask(
  cx: Ctx2D,
  mask: HTMLCanvasElement | OffscreenCanvas
) {
  Blend.withComposite(cx, "destination-in", () => {
    cx.drawImage(mask, 0, 0);
  });
}

/** Optional multiply grain over color (grain already masked). */
export function multiplyGrainOverColor(
  cx: Ctx2D,
  grainLayer: HTMLCanvasElement | OffscreenCanvas
) {
  Blend.withComposite(cx, "multiply", () => {
    cx.drawImage(grainLayer, 0, 0);
  });
}

/** Utility for building a grain layer from an imageData tile. */
export function buildGrainLayerFromTile(
  tileId: ImageData,
  viewW: number,
  viewH: number,
  alpha: number,
  rotateRad: number,
  anchor: { x: number; y: number }
) {
  const tile = CanvasUtil.createLayer(tileId.width, tileId.height);
  const tx = get2D(tile);
  tx.putImageData(tileId, 0, 0);

  const grainLayer = CanvasUtil.createLayer(viewW, viewH);
  const gx = get2D(grainLayer);
  gx.clearRect(0, 0, viewW, viewH);

  gx.save();
  gx.translate(anchor.x, anchor.y);
  gx.rotate(rotateRad);
  gx.translate(-anchor.x, -anchor.y);

  const pat = gx.createPattern(tile as unknown as CanvasImageSource, "repeat");
  if (pat) {
    (gx as unknown as { fillStyle: CanvasPattern | string }).fillStyle = pat;
    gx.globalAlpha = alpha;
    gx.fillRect(0, 0, viewW, viewH);
  }
  gx.restore();

  return { grainLayer, gx };
}
