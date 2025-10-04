// FILE: src/lib/brush/backends/ribbon/utils/canvas.ts
export type Ctx2D =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

export function createLayer(w: number, h: number): CanvasLike {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(w, h);
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function get2D(layer: CanvasLike): Ctx2D {
  const ctx = layer.getContext("2d", { alpha: true }) as Ctx2D | null;
  if (!ctx) throw new Error("2D context not available");
  return ctx;
}
