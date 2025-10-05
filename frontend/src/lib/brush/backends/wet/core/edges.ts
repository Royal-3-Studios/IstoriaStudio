import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer } from "@backends/utils/canvas";
import type { PaperModel } from "./paper";

/** Darken edges using blurred-minus-core trick, blended back in multiply. */
export function applyEdgeDarkening(
  target: OffscreenCanvas | HTMLCanvasElement,
  opts: { gain: number; radiusPx: number; paper: PaperModel }
): void {
  const w = (target as HTMLCanvasElement | OffscreenCanvas).width;
  const h = (target as HTMLCanvasElement | OffscreenCanvas).height;

  const blurred = createLayer(w, h);
  const bx = blurred.getContext("2d", { alpha: true }) as Ctx2D;
  bx.clearRect(0, 0, w, h);
  bx.drawImage(target, 0, 0);
  (bx as unknown as { filter: string }).filter =
    `blur(${Math.max(0.2, opts.radiusPx).toFixed(3)}px)`;
  bx.drawImage(blurred, 0, 0);
  (bx as unknown as { filter: string }).filter = "none";

  // Edge = blurred - original (approx via destination-out on a copy of blurred)
  const edge = createLayer(w, h);
  const ex = edge.getContext("2d", { alpha: true }) as Ctx2D;
  ex.clearRect(0, 0, w, h);
  ex.drawImage(blurred, 0, 0);
  ex.globalCompositeOperation = "destination-out";
  ex.drawImage(target, 0, 0);
  ex.globalCompositeOperation = "source-over";

  const tx = target.getContext("2d", { alpha: true }) as Ctx2D;
  tx.globalCompositeOperation = "multiply";
  // paper.sizing reduces edge capillary effect slightly
  tx.globalAlpha = Math.max(
    0,
    Math.min(1, (opts.gain || 0) * (1 - 0.3 * opts.paper.sizing))
  );
  tx.drawImage(edge, 0, 0);
  tx.globalAlpha = 1;
  tx.globalCompositeOperation = "source-over";
}
