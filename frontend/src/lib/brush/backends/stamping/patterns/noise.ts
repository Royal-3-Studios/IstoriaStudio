import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer, get2D } from "@backends/utils/canvas";
import { mulberry32 } from "../utils/rng";

export type NoisePatternOpts = {
  size?: number; // tile size (default 64)
  seed?: number; // RNG seed
  low?: number; // min gray 0..255 (default 80)
  high?: number; // max gray 0..255 (default 175)
  alpha?: number; // overall alpha 0..1 (default 1)
};

export function makeNoisePattern(
  ctx: Ctx2D,
  opts: NoisePatternOpts = {}
): CanvasPattern {
  const size = Math.max(8, Math.floor(opts.size ?? 64));
  const alpha = Math.max(0, Math.min(1, opts.alpha ?? 1));
  const low = Math.max(0, Math.min(255, Math.floor(opts.low ?? 80)));
  const high = Math.max(low, Math.min(255, Math.floor(opts.high ?? 175)));
  const rnd = mulberry32((opts.seed ?? 1) >>> 0);

  const tile = createLayer(size, size);
  const t = get2D(tile);

  const img = t.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const g = Math.floor(low + (high - low) * rnd.nextFloat());
    img.data[i + 0] = g;
    img.data[i + 1] = g;
    img.data[i + 2] = g;
    img.data[i + 3] = Math.floor(255 * alpha);
  }
  t.putImageData(img, 0, 0);

  const pat = ctx.createPattern(tile as unknown as CanvasImageSource, "repeat");
  if (!pat) throw new Error("Failed to create noise pattern");
  return pat;
}
