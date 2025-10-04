// FILE: src/lib/brush/backends/pattern/utils/canvas.ts

/** Shared 2D context type that works in both DOM and Offscreen canvases. */
export type Ctx2D =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

/** Canvas-like surface union. */
export type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

/** Narrowing guard. */
export function isCtx2D(x: unknown): x is Ctx2D {
  return !!x && typeof (x as CanvasRenderingContext2D).drawImage === "function";
}

/** Create a new canvas/offscreencanvas of (w,h). */
export function createLayer(width: number, height: number): CanvasLike {
  if (typeof OffscreenCanvas !== "undefined")
    return new OffscreenCanvas(width, height);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

/** Get a 2D context or throw. */
export function get2D(
  canvas: CanvasLike,
  opts: CanvasRenderingContext2DSettings = { alpha: true }
): Ctx2D {
  const ctx = canvas.getContext("2d", opts) as Ctx2D | null;
  if (!ctx) throw new Error("2D context not available.");
  return ctx;
}
