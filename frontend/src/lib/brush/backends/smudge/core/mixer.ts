// FILE: src/lib/brush/backends/smudge/core/mixer.ts
import type { Ctx2D, CanvasLike } from "../utils/canvas";
import { createLayer, get2D } from "../utils/canvas";
import { falloffGaussian, falloffCosine } from "./kernel";

/**
 * Simple wet mixer:
 * - maintains a tiny “buffer” color that picks up from under the tip
 * - lays that color down into the destination inside a falloff circle
 */
export class PaintBuffer {
  r = 0;
  g = 0;
  b = 0;
  a = 0;

  /** load under-color into buffer */
  pickup(ur: number, ug: number, ub: number, ua: number, k: number) {
    const t = Math.max(0, Math.min(1, k));
    this.r += (ur - this.r) * t;
    this.g += (ug - this.g) * t;
    this.b += (ub - this.b) * t;
    this.a += (ua - this.a) * t;
  }

  /** lay down from buffer (premultiplied over) */
  laydown(
    dest: Ctx2D,
    x: number,
    y: number,
    r: number,
    alpha: number,
    falloff: (r01: number) => number
  ) {
    const R = Math.max(0.5, r);
    const w = Math.ceil(R * 2);
    const h = Math.ceil(R * 2);
    const tmp = createLayer(w, h);
    const tx = get2D(tmp);
    const id = tx.createImageData(w, h);
    const d = id.data;
    const cx = w >> 1;
    const cy = h >> 1;

    const ar = this.r;
    const ag = this.g;
    const ab = this.b;
    const aa = Math.max(0, Math.min(1, this.a * alpha));

    // single pointer `p` avoids TS complaining when noUncheckedIndexedAccess is on
    for (let j = 0, p = 0; j < h; j++) {
      const dy = (j - cy) / R;
      for (let i = 0; i < w; i++, p += 4) {
        const dx = (i - cx) / R;
        const rr = Math.hypot(dx, dy);
        const f = Math.max(0, Math.min(1, falloff(rr)));
        const aByte = Math.round(255 * Math.max(0, Math.min(1, aa * f)));

        d[p + 0] = Math.round(ar);
        d[p + 1] = Math.round(ag);
        d[p + 2] = Math.round(ab);
        d[p + 3] = aByte;
      }
    }

    tx.putImageData(id, 0, 0);
    dest.drawImage(tmp, x - R, y - R);
  }
}

/** Sample the under-color at (x,y) into [0..255] premultiplied RGBA. */
export function sampleUnderColor(
  src: CanvasLike,
  x: number,
  y: number
): { r: number; g: number; b: number; a: number } {
  const sctx = get2D(src);
  const ix = Math.max(0, Math.floor(x));
  const iy = Math.max(0, Math.floor(y));
  const id = sctx.getImageData(ix, iy, 1, 1);
  const d = id.data; // Uint8ClampedArray length >= 4

  // guard each read in case of strict indexing options
  const r = d[0] ?? 0;
  const g = d[1] ?? 0;
  const b = d[2] ?? 0;
  const a = (d[3] ?? 0) / 255;

  return { r, g, b, a };
}

/** Mixer stamp: pickup -> laydown */
export function mixerStamp(
  destCtx: Ctx2D,
  srcCanvas: CanvasLike,
  buf: PaintBuffer,
  cx: number,
  cy: number,
  radiusPx: number,
  opts: {
    pickup: number; // 0..1
    laydown: number; // 0..1
    alpha: number; // 0..1
    falloff: "gaussian" | "cosine";
  }
): void {
  const { r, g, b, a } = sampleUnderColor(srcCanvas, cx, cy);
  if (opts.pickup > 0) {
    buf.pickup(r, g, b, a, Math.max(0, Math.min(1, opts.pickup)));
  }

  const f = opts.falloff === "cosine" ? falloffCosine : falloffGaussian;
  if (opts.laydown > 0) {
    buf.laydown(
      destCtx,
      cx,
      cy,
      Math.max(0.5, radiusPx),
      Math.max(0, Math.min(1, opts.laydown * opts.alpha)),
      f
    );
  }
}
