// FILE: src/lib/brush/backends/smudge/core/dissolve.ts
import type { Ctx2D, CanvasLike } from "@backends/utils/canvas";

/** Cheap dissolve by thresholding alpha against a small tiled noise. */
export function applyDissolve(
  layer: CanvasLike,
  amount01: number,
  scalePx: number
): void {
  const a = Math.max(0, Math.min(1, amount01));
  if (a <= 0) return;

  const w = (layer as HTMLCanvasElement | OffscreenCanvas).width;
  const h = (layer as HTMLCanvasElement | OffscreenCanvas).height;
  const ctx = layer.getContext("2d", { alpha: true }) as Ctx2D;

  const id = ctx.getImageData(0, 0, w, h);
  const data = id.data; // Uint8ClampedArray

  // tiny, deterministic hash; no RNG dependency
  const scale = Math.max(4, Math.round(scalePx || 12));
  function noise(x: number, y: number): number {
    const xi = Math.floor(x / scale);
    const yi = Math.floor(y / scale);
    // integer hash -> [0,1)
    let v = (xi * 73856093) ^ (yi * 19349663);
    v ^= v << 13;
    v ^= v >> 17;
    v ^= v << 5;
    // uint32 to [0,1)
    return ((v >>> 0) % 9973) / 9973;
  }

  const thresh = 0.5 + 0.45 * a; // grow threshold with amount

  // index per pixel to avoid noUncheckedIndexedAccess issues
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const off = (y * w + x) << 2; // RGBA packed
      const aByte = data[off + 3] ?? 0; // coalesce to 0
      const n = noise(x, y);
      const keep = aByte / 255 > n * thresh;
      data[off + 3] = keep ? aByte : 0;
    }
  }

  ctx.putImageData(id, 0, 0);
}
