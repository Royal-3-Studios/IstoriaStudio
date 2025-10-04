// FILE: src/lib/brush/backends/pattern/utils/tiles.ts

import { createLayer, get2D } from "./canvas";
import type { Ctx2D } from "./canvas";
import { makeFbmTile } from "../core/noise";

/** Dots tile (paper-like pores). */
export function makeDotsTile(
  size: number,
  density = 1.0,
  seed = 0
): HTMLCanvasElement | OffscreenCanvas {
  const s = Math.max(8, Math.floor(size));
  const c = createLayer(s, s);
  const ctx: Ctx2D = get2D(c);

  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = "rgba(0,0,0,0.65)";

  // simple LCG based on seed
  let t = seed >>> 0;
  const rnd = () => (t = (t * 1664525 + 1013904223) >>> 0) / 4294967296;

  const count = Math.max(1, Math.floor((s * s * density) / 140));
  for (let i = 0; i < count; i++) {
    const x = rnd() * s;
    const y = rnd() * s;
    const r = Math.max(0.4, 1.25 * rnd());
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2, false);
    ctx.fill();
  }
  return c;
}

/** Canvas hatch tile. */
export function makeHatchTile(size: number, thickness = 1.0) {
  const s = Math.max(8, Math.floor(size));
  const c = createLayer(s, s);
  const ctx: Ctx2D = get2D(c);

  ctx.clearRect(0, 0, s, s);
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.lineWidth = Math.max(0.5, thickness);

  ctx.beginPath();
  ctx.moveTo(-s * 0.25, s * 0.25);
  ctx.lineTo(s * 0.25, -s * 0.25);
  ctx.moveTo(s * 0.25, s * 1.25);
  ctx.lineTo(s * 1.25, s * 0.25);
  ctx.stroke();
  return c;
}

/** Checker tile. */
export function makeCheckerTile(size: number) {
  const s = Math.max(8, Math.floor(size));
  const c = createLayer(s, s);
  const ctx: Ctx2D = get2D(c);

  ctx.clearRect(0, 0, s, s);
  const h = Math.floor(s / 2);

  ctx.fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(0, 0, h, h);
  ctx.fillRect(h, h, h, h);

  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(h, 0, h, h);
  ctx.fillRect(0, h, h, h);
  return c;
}

// FILE: src/lib/brush/backends/pattern/utils/tiles.ts

/** FBM noise tile (grayscale). */
// FILE: src/lib/brush/backends/pattern/utils/tiles.ts

/** FBM noise tile (grayscale). */
export function makeHashNoiseTile(size: number) {
  const s = Math.max(16, Math.min(256, Math.floor(size)));
  const scale = Math.max(6, Math.round(size / 2));

  // ✅ pass options object: { scale, octaves }
  const id = makeFbmTile(s, s, { scale, octaves: 4 });

  const c = createLayer(s, s);
  const ctx = get2D(c);
  ctx.putImageData(id, 0, 0);
  return c;
}
