import type { Ctx2D } from "../utils/canvas";
import { createLayer, get2D } from "../utils/canvas";

export type CheckerPatternOpts = {
  size?: number; // tile size (default 64)
  cellPx?: number; // checker cell size (default 8)
  alphaA?: number; // alpha for color A (default 0.16)
  alphaB?: number; // alpha for color B (default 0.06)
};

export function makeCheckerPattern(
  ctx: Ctx2D,
  opts: CheckerPatternOpts = {}
): CanvasPattern {
  const size = Math.max(8, Math.floor(opts.size ?? 64));
  const cell = Math.max(2, Math.floor(opts.cellPx ?? 8));
  const aA = Math.max(0, Math.min(1, opts.alphaA ?? 0.16));
  const aB = Math.max(0, Math.min(1, opts.alphaB ?? 0.06));

  const tile = createLayer(size, size);
  const t = get2D(tile);

  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const even = (x / cell + y / cell) % 2 === 0;
      (t as CanvasRenderingContext2D).fillStyle = even
        ? `rgba(0,0,0,${aA})`
        : `rgba(0,0,0,${aB})`;
      t.fillRect(x, y, cell, cell);
    }
  }

  const pat = ctx.createPattern(tile as unknown as CanvasImageSource, "repeat");
  if (!pat) throw new Error("Failed to create checker pattern");
  return pat;
}
