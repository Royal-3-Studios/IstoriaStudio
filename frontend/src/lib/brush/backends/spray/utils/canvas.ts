// src/lib/brush/backends/spray/utils/canvas.ts
import { CanvasUtil } from "@backends";

export type Ctx2D =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export function createLayer(
  width: number,
  height: number
): HTMLCanvasElement | OffscreenCanvas {
  if (typeof CanvasUtil?.createLayer === "function") {
    return CanvasUtil.createLayer(width, height);
  }
  if (typeof OffscreenCanvas !== "undefined")
    return new OffscreenCanvas(width, height);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

function isCtx2D(x: unknown): x is Ctx2D {
  return !!x && typeof (x as CanvasRenderingContext2D).drawImage === "function";
}

export function get2D(canvas: HTMLCanvasElement | OffscreenCanvas): Ctx2D {
  // prefer your shared helper if present
  const anyCU = CanvasUtil as unknown as {
    get2DContext?: (
      c: HTMLCanvasElement | OffscreenCanvas,
      o?: CanvasRenderingContext2DSettings
    ) => Ctx2D;
  };
  if (typeof anyCU.get2DContext === "function") {
    return anyCU.get2DContext(canvas, { alpha: true });
  }

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!isCtx2D(ctx)) throw new Error("2D context not available.");
  return ctx;
}
