// FILE: src/lib/brush/backends/utils/canvas.ts
// Canonical canvas helpers (single source of truth)
// - Strict TypeScript (no `any`), null-safe, worker-safe.
// - Superset of your old file: DPR helpers, PixelBuf I/O, blend re-exports,
//   premultiply/unpremultiply, withLayer, blit, and DPR-aware createLayer2D.

import type { BlendMode, PixelBuf } from "@/lib/brush/core/types";
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

function getOffscreenCtor(): typeof OffscreenCanvas | undefined {
  return (globalThis as { OffscreenCanvas?: typeof OffscreenCanvas })
    .OffscreenCanvas;
}

function getHtmlCanvasCtor(): typeof HTMLCanvasElement | undefined {
  return (globalThis as { HTMLCanvasElement?: typeof HTMLCanvasElement })
    .HTMLCanvasElement;
}

export function isOffscreenCanvas(x: unknown): x is OffscreenCanvas {
  const C = getOffscreenCtor();
  return typeof C !== "undefined" && x instanceof C;
}

export function isHtmlCanvas(x: unknown): x is HTMLCanvasElement {
  const H = getHtmlCanvasCtor();
  return typeof H !== "undefined" && x instanceof H;
}

function isCanvas2DContext(ctx: unknown): ctx is Ctx2D {
  const c = ctx as Partial<CanvasRenderingContext2D>;
  return (
    !!c &&
    typeof c.drawImage === "function" &&
    typeof c.clearRect === "function" &&
    typeof c.setTransform === "function"
  );
}

/** Public guard if you need it elsewhere. */
export function isCtx2D(
  ctx: unknown
): ctx is CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  return isCanvas2DContext(ctx);
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
  const ctx = canvas.getContext("2d", attrs);
  if (!isCanvas2DContext(ctx)) throw new Error("2D context unavailable");
  return ctx;
}

/* ============================== DPR / Sizing =============================== */

/**
 * Ensure the canvas has the correct internal pixel size for given CSS width/height and DPR.
 * Sets HTMLCanvasElement style size and applies a device transform so drawing uses CSS px.
 * Returns a 2D context ready for CSS-px coordinates.
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
  } else if (isHtmlCanvas(canvas)) {
    if (canvas.width !== deviceW) canvas.width = deviceW;
    if (canvas.height !== deviceH) canvas.height = deviceH;
    // only set if different to avoid layout churn
    if (canvas.style.width !== `${cssWidth}px`)
      canvas.style.width = `${cssWidth}px`;
    if (canvas.style.height !== `${cssHeight}px`)
      canvas.style.height = `${cssHeight}px`;
  }

  const ctx = get2D(canvas, ctxAttrs);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/**
 * Variant that only sizes and returns pixel dims; caller can get ctx separately.
 */
export function ensureCanvasDprSize(
  canvas: CanvasLike,
  cssW: number,
  cssH: number,
  dpr: number
): { pixelW: number; pixelH: number } {
  const pixelW = Math.max(1, Math.floor(cssW * dpr));
  const pixelH = Math.max(1, Math.floor(cssH * dpr));

  if (isOffscreenCanvas(canvas)) {
    if (canvas.width !== pixelW) canvas.width = pixelW;
    if (canvas.height !== pixelH) canvas.height = pixelH;
  } else if (isHtmlCanvas(canvas)) {
    if (canvas.width !== pixelW) canvas.width = pixelW;
    if (canvas.height !== pixelH) canvas.height = pixelH;
    if (canvas.style.width !== `${cssW}px`) canvas.style.width = `${cssW}px`;
    if (canvas.style.height !== `${cssH}px`) canvas.style.height = `${cssH}px`;
  }

  const ctx = get2D(canvas);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  return { pixelW, pixelH };
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
  const ix = Math.max(0, Math.floor(x));
  const iy = Math.max(0, Math.floor(y));
  const iw = Math.max(1, Math.floor(w));
  const ih = Math.max(1, Math.floor(h));
  const img = ctx.getImageData(ix, iy, iw, ih);
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

/** Create an offscreen layer (prefers OffscreenCanvas). Returns just the canvas. */
export function createLayer(width: number, height: number): CanvasLike {
  const C = getOffscreenCtor();
  if (typeof C !== "undefined") {
    return new C(
      Math.max(1, Math.floor(width)),
      Math.max(1, Math.floor(height))
    );
  }
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.floor(width));
  c.height = Math.max(1, Math.floor(height));
  return c;
}

/**
 * Create a DPR-aware layer with ctx scaled to CSS px.
 */
export function createLayer2D(
  cssW: number,
  cssH: number,
  dpr: number,
  attrs: CanvasRenderingContext2DSettings = { alpha: true }
): { canvas: CanvasLike; ctx: Ctx2D } {
  const canvas = createLayer(
    Math.max(1, Math.floor(cssW * dpr)),
    Math.max(1, Math.floor(cssH * dpr))
  );
  const ctx = get2D(canvas, attrs);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  return { canvas, ctx };
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

/* ============================== Blit helper =============================== */

/** Treat CanvasLike as a CanvasImageSource without loosening types to `any`. */
function asCanvasImageSource(src: CanvasLike): CanvasImageSource {
  // Both HTMLCanvasElement and OffscreenCanvas are valid CanvasImageSource in lib.dom.
  return src as unknown as CanvasImageSource;
}

/** Draw one canvas onto another using CSS coordinates (pre-scaled by dpr). */
export function blit(
  dst: CanvasLike,
  src: CanvasLike,
  dx = 0,
  dy = 0,
  dWidth?: number,
  dHeight?: number
): void {
  const dctx = get2D(dst);
  const s = asCanvasImageSource(src);
  if (typeof dWidth === "number" && typeof dHeight === "number") {
    dctx.drawImage(s, dx, dy, dWidth, dHeight);
  } else {
    dctx.drawImage(s, dx, dy);
  }
}

/* ============================== Premultiply helpers ======================= */
// Replace your existing in-place functions with these:

function assertRgbaStride(buf: PixelBuf): void {
  if (buf.data.length !== buf.width * buf.height * 4) {
    throw new Error(
      `PixelBuf.data length (${buf.data.length}) != ${buf.width}×${buf.height}×4`
    );
  }
}

/** Premultiply RGB by A (in place). Uses DataView to avoid indexer typing issues. */
export function premultiplyInPlace(buf: PixelBuf): void {
  assertRgbaStride(buf);
  const data = buf.data; // Uint8ClampedArray (or anything with same buffer)
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const n = data.byteLength; // multiple of 4 by assert

  for (let i = 0; i < n; i += 4) {
    const a = view.getUint8(i + 3); // 0..255
    if (a === 0) {
      // rgb := 0
      view.setUint8(i, 0);
      view.setUint8(i + 1, 0);
      view.setUint8(i + 2, 0);
    } else if (a !== 255) {
      const f = a / 255;
      const r = Math.round(view.getUint8(i) * f);
      const g = Math.round(view.getUint8(i + 1) * f);
      const b = Math.round(view.getUint8(i + 2) * f);
      view.setUint8(i, r);
      view.setUint8(i + 1, g);
      view.setUint8(i + 2, b);
    }
    // a==255: rgb unchanged
  }
}

/** Un-premultiply RGB by A (in place). Uses DataView to avoid indexer typing issues. */
export function unpremultiplyInPlace(buf: PixelBuf): void {
  assertRgbaStride(buf);
  const data = buf.data;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const n = data.byteLength;

  for (let i = 0; i < n; i += 4) {
    const a = view.getUint8(i + 3); // 0..255
    if (a === 0) {
      view.setUint8(i, 0);
      view.setUint8(i + 1, 0);
      view.setUint8(i + 2, 0);
    } else if (a !== 255) {
      const inv = 255 / a;
      const r = Math.round(view.getUint8(i) * inv);
      const g = Math.round(view.getUint8(i + 1) * inv);
      const b = Math.round(view.getUint8(i + 2) * inv);
      view.setUint8(i, r);
      view.setUint8(i + 1, g);
      view.setUint8(i + 2, b);
    }
  }
}
