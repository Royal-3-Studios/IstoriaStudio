// FILE: src/lib/brush/backends/smudge.ts
/**
 * Smudge/Blend backend (stub, production-ready shape)
 *
 * Purpose: move existing pixels rather than lay new paint.
 * Strategy: sample from the canvas under the brush and re-draw with
 * direction-aware offsets and falloff. This stub implements a simple
 * smear so you can wire it now; you can later swap in a higher-quality
 * KDE-style or fluid-advection blend.
 */

import type { RenderOptions } from "@/lib/brush/engine";

export type SmudgeOptions = RenderOptions;

export function drawSmudge(ctx: CanvasRenderingContext2D, opt: SmudgeOptions) {
  const D = Math.max(1, opt.baseSizePx * (opt.engine.shape?.sizeScale ?? 1));
  const R = D * 0.5;
  const path = opt.path ?? [];
  if (path.length < 2) return;

  // Lightweight smudge: copy small patches along the path
  // and re-deposit slightly ahead in stroke direction.
  const pr = Math.max(1, Math.min(4, opt.pixelRatio ?? 2));

  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;

    // Source region under the brush
    const sx = a.x - R;
    const sy = a.y - R;
    const sw = D;
    const sh = D;

    // Destination ahead along the stroke
    const adv = Math.min(R * 0.6, 12);
    const dxp = a.x + nx * adv - R;
    const dyp = a.y + ny * adv - R;

    try {
      const img = ctx.getImageData(
        sx * pr,
        sy * pr,
        Math.max(1, sw * pr),
        Math.max(1, sh * pr)
      );
      // simple falloff mask (circular)
      const r = R * pr;
      const r2 = r * r;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const dxl = x - img.width / 2;
          const dyl = y - img.height / 2;
          const d2 = dxl * dxl + dyl * dyl;
          const k = d2 >= r2 ? 0 : 1 - d2 / r2; // linear falloff
          const idx = (y * img.width + x) * 4 + 3; // alpha
          img.data[idx] = Math.round(img.data[idx] * k);
        }
      }
      ctx.putImageData(img, dxp * pr, dyp * pr);
    } catch {
      // getImageData can throw if outside bounds; ignore safely
    }
  }
}

export const backendId = "smudge" as const;
export default drawSmudge;
