import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer } from "@backends/utils/canvas";
import type { PaperModel } from "./paper";

/**
 * Cheap CPU diffusion pass using a blur and self-blend.
 * Returns a new layer containing the diffused pigment (alpha encodes concentration).
 */
export function diffusePass(
  sourceMask: OffscreenCanvas | HTMLCanvasElement,
  opts: { iterations: number; diffusion: number; paper: PaperModel }
): OffscreenCanvas | HTMLCanvasElement {
  const w = (sourceMask as HTMLCanvasElement | OffscreenCanvas).width;
  const h = (sourceMask as HTMLCanvasElement | OffscreenCanvas).height;

  const work = createLayer(w, h);
  const wx = work.getContext("2d", { alpha: true }) as Ctx2D;
  wx.clearRect(0, 0, w, h);
  wx.drawImage(sourceMask, 0, 0);

  const iter = Math.max(1, Math.floor(opts.iterations));
  const k = Math.max(0, Math.min(2, opts.diffusion));
  const blurPx = 0.6 + 1.2 * k; // 0.6..3.0px

  for (let i = 0; i < iter; i++) {
    (wx as unknown as { filter: string }).filter =
      `blur(${blurPx.toFixed(3)}px)`;
    wx.drawImage(work, 0, 0);
    (wx as unknown as { filter: string }).filter = "none";

    // Slightly tone down to simulate evaporation / absorption
    wx.globalCompositeOperation = "destination-in";
    wx.globalAlpha = 0.96 - 0.08 * (opts.paper.sizing * 0.5);
    wx.drawImage(work, 0, 0);
    wx.globalAlpha = 1;
    wx.globalCompositeOperation = "source-over";
  }
  return work;
}

/**
 * Pooling: push some pigment toward local valleys (simulated by a soft blur
 * and multiply). Mutates `target` in place.
 */
export function poolPass(
  target: OffscreenCanvas | HTMLCanvasElement,
  opts: { amount: number; paper: PaperModel }
): void {
  const w = (target as HTMLCanvasElement | OffscreenCanvas).width;
  const h = (target as HTMLCanvasElement | OffscreenCanvas).height;

  const poolLayer = createLayer(w, h);
  const px = poolLayer.getContext("2d", { alpha: true }) as Ctx2D;

  // Start from the target alpha (pigment)
  px.clearRect(0, 0, w, h);
  px.drawImage(target, 0, 0);

  // Create a soft valley mask
  (px as unknown as { filter: string }).filter = "blur(1.6px)";
  px.drawImage(poolLayer, 0, 0);
  (px as unknown as { filter: string }).filter = "none";

  // Apply pooling by multiplying back onto the target with gain
  const gain = Math.max(0, Math.min(2, opts.amount));
  const tx = target.getContext("2d", { alpha: true }) as Ctx2D;
  tx.globalCompositeOperation = "multiply";
  tx.globalAlpha = 0.25 + 0.35 * gain + 0.2 * opts.paper.granulation;
  tx.drawImage(poolLayer, 0, 0);
  tx.globalAlpha = 1;
  tx.globalCompositeOperation = "source-over";
}
