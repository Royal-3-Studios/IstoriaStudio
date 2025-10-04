export type Ctx2D =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

export function createLayer(w: number, h: number): CanvasLike {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function get2D(canvas: CanvasLike): Ctx2D {
  const ctx = canvas.getContext("2d", { alpha: true }) as Ctx2D | null;
  if (!ctx) throw new Error("2D context not available.");
  return ctx;
}
