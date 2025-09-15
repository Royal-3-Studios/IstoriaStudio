// FILE: src/lib/brush/backends/pattern.ts
/**
 * Pattern/Tile backend (stub)
 *
 * Purpose: repeat a tile/texture along the path (fabric, scales, chains).
 * Strategy: createPattern from a tile (provided later via overrides or preset),
 * then stamp it along the path with rotation.
 */

import type { RenderOptions } from "@/lib/brush/engine";

export type PatternOptions = RenderOptions & {
  // future: expose tile source via overrides or preset
  tile?: HTMLCanvasElement | HTMLImageElement;
};

export function drawPattern(
  ctx: CanvasRenderingContext2D,
  opt: PatternOptions
) {
  const D = Math.max(1, opt.baseSizePx * (opt.engine.shape?.sizeScale ?? 1));
  const R = D * 0.5;
  const path = opt.path ?? [];
  if (path.length < 2) return;

  // Placeholder tile (soft diamond) until real tiles are provided
  const pr = Math.max(1, Math.min(4, opt.pixelRatio ?? 2));
  const tile = document.createElement("canvas");
  tile.width = Math.ceil(D * pr);
  tile.height = Math.ceil(D * pr);
  const tctx = tile.getContext("2d")!;
  tctx.setTransform(pr, 0, 0, pr, 0, 0);
  tctx.translate(R, R);
  tctx.rotate(Math.PI / 4);
  tctx.fillStyle = "rgba(0,0,0,0.25)";
  tctx.fillRect(-R * 0.6, -R * 0.1, R * 1.2, R * 0.2);

  const pat = ctx.createPattern(tile, "repeat")!;

  // Draw along the path by stamping quads filled with the pattern
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(ang);
    ctx.fillStyle = pat;
    ctx.fillRect(-R, -R, D, D);
    ctx.restore();
  }
}

export const backendId3 = "pattern" as const;
export default drawPattern;
