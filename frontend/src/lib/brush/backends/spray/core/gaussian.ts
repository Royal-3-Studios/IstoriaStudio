// FILE: src/lib/brush/backends/spray/core/gaussian.ts

export type GaussianSprite = {
  canvas: HTMLCanvasElement;
  /** Half the sprite size in pixels (radius). */
  half: number;
};

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

/**
 * Build a normalized Gaussian alpha sprite.
 * - Alpha peaks at 1.0 at the center after normalization.
 * - RGB is white; the renderer uses only alpha.
 */
export function makeGaussianSprite(
  res: number,
  sigmaPx: number,
  hardness: number
): GaussianSprite {
  const size = Math.max(16, res | 0 || 256);
  const half = size / 2;

  // Map hardness to a gentle sigma reduction (keep non-zero).
  const h = clamp(hardness ?? 0, 0, 100);
  const hfac = 1 - h / 110; // mild sharpening, never hits 0
  const sigma = Math.max(0.001, sigmaPx * hfac);
  const twoSigma2 = 2 * sigma * sigma;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("gaussian: failed to get 2D context");

  const img = ctx.createImageData(size, size);
  const data = img.data; // Uint8ClampedArray

  let maxA = 0;

  // ---- Safe accessors to satisfy noUncheckedIndexedAccess ----
  const writeRGBA = (
    idx: number,
    r: number,
    g: number,
    b: number,
    a255: number
  ) => {
    if (idx < 0 || idx + 3 >= data.length) return;
    data[idx] = r;
    data[idx + 1] = g;
    data[idx + 2] = b;
    data[idx + 3] = a255;
  };

  const readAlpha = (idx: number): number => {
    if (idx < 0 || idx >= data.length) return 0;
    const v = data[idx];
    // v is number | undefined under strict settings; coalesce to 0
    return typeof v === "number" ? v : 0;
  };

  const writeAlpha = (idx: number, a255: number) => {
    if (idx < 0 || idx >= data.length) return;
    data[idx] = a255;
  };
  // ------------------------------------------------------------

  // Write white with Gaussian alpha
  for (let y = 0; y < size; y++) {
    const dy = y - half;
    for (let x = 0; x < size; x++) {
      const dx = x - half;
      const r2 = dx * dx + dy * dy;
      const a = Math.exp(-r2 / twoSigma2); // 0..1
      const i = (y * size + x) * 4;
      const a255 = Math.max(0, Math.min(255, Math.round(a * 255)));
      writeRGBA(i, 255, 255, 255, a255);
      if (a > maxA) maxA = a;
    }
  }

  // Normalize so peak alpha == 255 (alpha==1)
  if (maxA > 0 && maxA < 1) {
    const scale = 1 / maxA;
    for (let i = 3; i < data.length; i += 4) {
      const aByte = readAlpha(i); // 0..255
      const a = aByte / 255; // 0..1
      const a255 = Math.max(0, Math.min(255, Math.round(a * scale * 255)));
      writeAlpha(i, a255);
    }
  }

  ctx.putImageData(img, 0, 0);
  return { canvas, half };
}
