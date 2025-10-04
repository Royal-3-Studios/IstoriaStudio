// FILE: src/lib/brush/backends/stamping/utils/canvas.ts
export type CanvasLike = HTMLCanvasElement | OffscreenCanvas;
export type Ctx2D =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export function createLayer(w: number, h: number): CanvasLike {
  const useOff = typeof OffscreenCanvas !== "undefined";
  return useOff
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement("canvas"), { width: w, height: h });
}

export function get2D(layer: CanvasLike): Ctx2D {
  const ctx = layer.getContext("2d", { alpha: true }) as Ctx2D | null;
  if (!ctx) throw new Error("2D context unavailable");
  return ctx;
}
