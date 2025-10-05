import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer, get2D } from "@backends/utils/canvas";
import { mulberry32 } from "@backends/utils/random";

export type DotsPatternOpts = {
  /** Tile size in CSS px (repeat unit). */
  size?: number; // default 64
  /** 0..1 density of dots. Typical 0.08–0.35. */
  density?: number; // default 0.18
  /** Dot radius (px). */
  radiusPx?: number; // default 1.0
  /** Seed for stable randomness. */
  seed?: number; // default 1
  /** Dot alpha (0..1). */
  alpha?: number; // default 0.9
};

export function makeDotsPattern(
  ctx: Ctx2D,
  opts: DotsPatternOpts = {}
): CanvasPattern {
  const size = Math.max(8, Math.floor(opts.size ?? 64));
  const density = Math.max(0, Math.min(1, opts.density ?? 0.18));
  const r = Math.max(0.25, opts.radiusPx ?? 1.0);
  const alpha = Math.max(0, Math.min(1, opts.alpha ?? 0.9));
  const rnd = mulberry32((opts.seed ?? 1) >>> 0);

  const tile = createLayer(size, size);
  const t = get2D(tile);

  (t as CanvasRenderingContext2D).fillStyle = `rgba(0,0,0,${alpha})`;

  // Roughly density * size*size / (avg dot area) but keep simple:
  const count = Math.floor(
    ((density * (size * size)) / (Math.PI * r * r)) * 0.9
  );
  for (let i = 0; i < count; i++) {
    const x = rnd.nextFloat() * size;
    const y = rnd.nextFloat() * size;
    t.beginPath();
    t.arc(x, y, r, 0, Math.PI * 2, false);
    t.fill();
  }

  const pat = ctx.createPattern(tile as unknown as CanvasImageSource, "repeat");
  if (!pat) throw new Error("Failed to create dots pattern");
  return pat;
}
