import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer, get2D } from "@backends/utils/canvas";

export type HatchPatternOpts = {
  size?: number; // tile size px (default 64)
  pitchPx?: number; // distance between lines (default 6)
  lineWidth?: number; // line thickness (default 1)
  angleDeg?: number; // hatch angle (default 45)
  alpha?: number; // 0..1 (default 0.8)
};

export function makeHatchPattern(
  ctx: Ctx2D,
  opts: HatchPatternOpts = {}
): CanvasPattern {
  const size = Math.max(8, Math.floor(opts.size ?? 64));
  const pitch = Math.max(2, opts.pitchPx ?? 6);
  const lw = Math.max(0.25, opts.lineWidth ?? 1);
  const alpha = Math.max(0, Math.min(1, opts.alpha ?? 0.8));
  const angle = ((opts.angleDeg ?? 45) * Math.PI) / 180;

  const tile = createLayer(size, size);
  const t = get2D(tile);

  t.save();
  t.translate(size / 2, size / 2);
  t.rotate(angle);
  t.translate(-size / 2, -size / 2);

  (t as CanvasRenderingContext2D).strokeStyle = `rgba(0,0,0,${alpha})`;
  (t as CanvasRenderingContext2D).lineWidth = lw;

  // Draw vertical lines in rotated space so they become angled
  for (let x = -size; x <= size * 2; x += pitch) {
    t.beginPath();
    t.moveTo(x, -size);
    t.lineTo(x, size * 2);
    t.stroke();
  }

  t.restore();

  const pat = ctx.createPattern(tile as unknown as CanvasImageSource, "repeat");
  if (!pat) throw new Error("Failed to create hatch pattern");
  return pat;
}
