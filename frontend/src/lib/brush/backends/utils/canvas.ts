// src/lib/brush/backends/utils/canvas.ts

import type { BlendMode } from "@/lib/brush/core/types";
import type { PixelBuf } from "@/lib/brush/core/types";
import {
  toCompositeOp,
  isCompositeSupported,
  pushComposite,
  withComposite,
  pushAlpha,
  withAlpha,
  withCompositeAndAlpha,
  type Ctx2D as BlendCtx2D,
} from "./blending";

/* ============================== Types & Guards ============================== */

export type CanvasLike = HTMLCanvasElement | OffscreenCanvas;
export type Ctx2D = BlendCtx2D;

function isOffscreenCanvas(x: unknown): x is OffscreenCanvas {
  return typeof OffscreenCanvas !== "undefined" && x instanceof OffscreenCanvas;
}

function isCanvas2DContext(ctx: RenderingContext | Ctx2D | null): ctx is Ctx2D {
  return (
    !!ctx &&
    typeof (ctx as CanvasRenderingContext2D).getImageData === "function" &&
    typeof (ctx as CanvasRenderingContext2D).drawImage === "function"
  );
}

/** Public guard if you need it elsewhere. */
export function isCtx2D(
  ctx: unknown
): ctx is CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  return isCanvas2DContext(ctx as RenderingContext | Ctx2D | null);
}

/** Try to get a 2D context; return null if unavailable (no throw). */
export function get2DOrNull(
  canvas: CanvasLike,
  attrs: CanvasRenderingContext2DSettings = { alpha: true }
): Ctx2D | null {
  const ctx = canvas.getContext("2d", attrs);
  return isCanvas2DContext(ctx) ? (ctx as Ctx2D) : null;
}

/** Get a 2D context or throw (useful in code paths that must have 2D). */
export function get2D(
  canvas: CanvasLike,
  attrs: CanvasRenderingContext2DSettings = { alpha: true }
): Ctx2D {
  const ctx = get2DOrNull(canvas, attrs);
  if (!ctx) throw new Error("2D context unavailable");
  return ctx;
}

/* ============================== DPR / Sizing =============================== */

/**
 * Ensure the canvas has the correct internal pixel size for the given CSS width/height and DPR.
 * Sets style.size for HTMLCanvasElement and applies a device transform so subsequent drawing uses CSS px.
 * Returns a 2D context ready for drawing in CSS-px coordinates.
 */
export function ensureCanvas2D(
  canvas: CanvasLike,
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  ctxAttrs: CanvasRenderingContext2DSettings = { alpha: true }
): Ctx2D {
  const deviceW = Math.max(1, Math.floor(cssWidth * dpr));
  const deviceH = Math.max(1, Math.floor(cssHeight * dpr));

  if (isOffscreenCanvas(canvas)) {
    if (canvas.width !== deviceW) canvas.width = deviceW;
    if (canvas.height !== deviceH) canvas.height = deviceH;
  } else {
    const html = canvas as HTMLCanvasElement;
    if (html.width !== deviceW) html.width = deviceW;
    if (html.height !== deviceH) html.height = deviceH;
    // Only set style size if not already specified
    if (html.style.width === "" || html.style.height === "") {
      html.style.width = `${cssWidth}px`;
      html.style.height = `${cssHeight}px`;
    }
  }

  const ctx = canvas.getContext("2d", ctxAttrs) as Ctx2D | null;
  if (!isCanvas2DContext(ctx)) throw new Error("2D context unavailable");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** Clear the canvas in CSS px coordinates (after ensureCanvas2D). */
export function clearCanvas(
  ctx: Ctx2D,
  cssWidth: number,
  cssHeight: number
): void {
  ctx.clearRect(0, 0, cssWidth, cssHeight);
}

/* ============================== PixelBuf I/O =============================== */

export function createPixelBuf(
  width: number,
  height: number,
  data?: Uint8ClampedArray
): PixelBuf {
  return {
    width,
    height,
    data: data ?? new Uint8ClampedArray(width * height * 4),
  };
}

/** Read pixels from a canvas (full frame) into a new PixelBuf. */
export function readPixels(canvas: CanvasLike): PixelBuf {
  const ctx = canvas.getContext("2d");
  if (!isCanvas2DContext(ctx)) throw new Error("2D context unavailable");
  const w = isOffscreenCanvas(canvas)
    ? canvas.width
    : (canvas as HTMLCanvasElement).width;
  const h = isOffscreenCanvas(canvas)
    ? canvas.height
    : (canvas as HTMLCanvasElement).height;
  const img = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: new Uint8ClampedArray(img.data) };
}

/** Read a sub-rect (in device pixels) from a canvas into a PixelBuf. */
export function readPixelsRect(
  canvas: CanvasLike,
  x: number,
  y: number,
  w: number,
  h: number
): PixelBuf {
  const ctx = canvas.getContext("2d");
  if (!isCanvas2DContext(ctx)) throw new Error("2D context unavailable");
  const img = ctx.getImageData(
    Math.floor(x),
    Math.floor(y),
    Math.max(1, Math.floor(w)),
    Math.max(1, Math.floor(h))
  );
  return {
    width: img.width,
    height: img.height,
    data: new Uint8ClampedArray(img.data),
  };
}

/** Write a PixelBuf to a canvas at (dx,dy) in device pixels. */
export function writePixels(
  canvas: CanvasLike,
  pix: PixelBuf,
  dx = 0,
  dy = 0
): void {
  const ctx = canvas.getContext("2d");
  if (!isCanvas2DContext(ctx)) throw new Error("2D context unavailable");
  const img = new ImageData(pix.data, pix.width, pix.height);
  ctx.putImageData(img, Math.floor(dx), Math.floor(dy));
}

/* ============================== Composite / Blend ========================== */

/**
 * Permanently set composite (blend) mode on the context with graceful fallback to "source-over".
 * If you prefer scoped state, use the exported push/with helpers from blending.ts.
 */
export function setCompositeMode(
  ctx: Ctx2D,
  mode: BlendMode | GlobalCompositeOperation
): void {
  const desired = toCompositeOp(mode);
  try {
    const supported = isCompositeSupported(ctx, desired);
    ctx.globalCompositeOperation = supported ? desired : "source-over";
  } catch {
    ctx.globalCompositeOperation = "source-over";
  }
}

/* Re-export optional helpers so backends can import from one place if they like. */
export {
  toCompositeOp,
  isCompositeSupported,
  pushComposite,
  withComposite,
  pushAlpha,
  withAlpha,
  withCompositeAndAlpha,
};

/* ============================== Layers / Scratch ========================== */

/** Create an offscreen layer (prefers OffscreenCanvas). */
export function createLayer(width: number, height: number): CanvasLike {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(
      Math.max(1, Math.floor(width)),
      Math.max(1, Math.floor(height))
    );
  }
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.floor(width));
  c.height = Math.max(1, Math.floor(height));
  return c;
}

/** With a temporary layer: create → draw via callback → return layer and callback result. */
export function withLayer<T>(
  width: number,
  height: number,
  draw: (ctx: Ctx2D, layer: CanvasLike) => T
): { layer: CanvasLike; result: T } {
  const layer = createLayer(width, height);
  const ctx = layer.getContext("2d");
  if (!isCanvas2DContext(ctx)) throw new Error("2D context unavailable");
  const result = draw(ctx, layer);
  return { layer, result };
}

/* ============================== Premultiply helpers ======================= */

/** Premultiply a PixelBuf in-place (RGBA sRGB bytes). */
export function premultiply(buf: PixelBuf): void {
  const d = buf.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    d[i] = Math.round(d[i] * a);
    d[i + 1] = Math.round(d[i + 1] * a);
    d[i + 2] = Math.round(d[i + 2] * a);
  }
}

/** Un-premultiply a PixelBuf in-place (RGBA sRGB bytes). */
export function unpremultiply(buf: PixelBuf): void {
  const d = buf.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 0) continue;
    const ia = 255 / a;
    d[i] = Math.round(d[i] * ia);
    d[i + 1] = Math.round(d[i + 1] * ia);
    d[i + 2] = Math.round(d[i + 2] * ia);
  }
}
