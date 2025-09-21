// FILE: src/lib/brush/backends/utils/offscreen.ts

import { type Ctx2D, isHtmlCanvas } from "./ctx2d";

/* ----------------------------- Small type bridge ----------------------------- */

type CanvasWithWH =
  | HTMLCanvasElement
  | (OffscreenCanvas & {
      width: number;
      height: number;
    });

function getCanvasWH(c: HTMLCanvasElement | OffscreenCanvas): {
  width: number;
  height: number;
} {
  const cc = c as unknown as CanvasWithWH;
  return { width: cc.width, height: cc.height };
}

function setCanvasWH(
  c: HTMLCanvasElement | OffscreenCanvas,
  w: number,
  h: number
) {
  const cc = c as unknown as CanvasWithWH;
  if (cc.width !== w) cc.width = w;
  if (cc.height !== h) cc.height = h;
}

/* --------------------------------- API --------------------------------- */

/** Integer pixel size derived from CSS size × DPR. */
export function cssToPixels(cssW: number, cssH: number, dpr: number) {
  const w = Math.max(1, Math.floor(cssW * dpr));
  const h = Math.max(1, Math.floor(cssH * dpr));
  return { w, h };
}

/**
 * Ensure the canvas has the correct backing-store pixel size for the given CSS size and DPR.
 * - Always updates `.width/.height` (both DOM and Offscreen).
 * - Only touches `.style.width/.style.height` when it’s a DOM canvas and empty.
 * Returns the pixel size that was applied.
 */
export function ensureCanvasDprSize(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  cssW: number,
  cssH: number,
  dpr: number
) {
  const { w, h } = cssToPixels(cssW, cssH, dpr);

  // Resize backing store if needed (works for both canvas kinds)
  setCanvasWH(canvas, w, h);

  // If it’s a DOM canvas, also ensure its CSS size matches the requested CSS px (only if unset)
  if (isHtmlCanvas(canvas)) {
    if (canvas.style.width === "" || canvas.style.height === "") {
      canvas.style.width = `${Math.max(1, Math.floor(cssW))}px`;
      canvas.style.height = `${Math.max(1, Math.floor(cssH))}px`;
    }
  }

  return { pixelW: w, pixelH: h };
}

/** Reset transform to identity and clear the full pixel buffer. */
export function clear2D(ctx: Ctx2D, pixelW?: number, pixelH?: number) {
  const { width, height } = getCanvasPixelSize(
    (ctx as unknown as { canvas: HTMLCanvasElement | OffscreenCanvas }).canvas
  );
  const w = pixelW ?? width ?? 0;
  const h = pixelH ?? height ?? 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
}

/**
 * Temporarily apply a DPR transform (CSS space) while running `fn`,
 * then restore. Use when you want to draw with CSS coordinates.
 */
export function withDpr(ctx: Ctx2D, dpr: number, fn: () => void) {
  ctx.save();
  try {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fn();
  } finally {
    ctx.restore();
  }
}

/** Helper to draw any bitmap-like source stretched to a CSS rectangle. */
export function drawSourceCss(
  ctx: Ctx2D,
  src: CanvasImageSource,
  cssX: number,
  cssY: number,
  cssW: number,
  cssH: number
) {
  ctx.drawImage(src, cssX, cssY, cssW, cssH);
}

/** Read current pixel (backing-store) size from a canvas. */
export function getCanvasPixelSize(
  canvas: HTMLCanvasElement | OffscreenCanvas
) {
  return getCanvasWH(canvas);
}
