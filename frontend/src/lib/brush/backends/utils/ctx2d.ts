// FILE: src/lib/brush/backends/utils/ctx2d.ts

/** Union for 2D canvas contexts (main thread + worker). */
export type Ctx2D =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

/** Narrow an unknown value to a 2D rendering context by structure, not inheritance. */
export function isCtx2D(ctx: unknown): ctx is Ctx2D {
  if (!ctx || typeof ctx !== "object") return false;
  const c = ctx as Partial<CanvasRenderingContext2D>;
  return (
    typeof c.drawImage === "function" &&
    typeof c.clearRect === "function" &&
    typeof c.setTransform === "function" &&
    typeof c.beginPath === "function"
  );
}

/** True if the argument is an HTMLCanvasElement (DOM canvas). */
export function isHtmlCanvas(c: unknown): c is HTMLCanvasElement {
  // Guard against environments without HTMLCanvasElement (e.g., worker)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - HTMLCanvasElement may be absent in some lib targets
  return (
    typeof HTMLCanvasElement !== "undefined" && c instanceof HTMLCanvasElement
  );
}

/** True if the argument is an OffscreenCanvas (worker- and main-thread capable). */
export function isOffscreenCanvas(c: unknown): c is OffscreenCanvas {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - OffscreenCanvas may be absent in some lib targets
  return typeof OffscreenCanvas !== "undefined" && c instanceof OffscreenCanvas;
}

/**
 * Fetch a 2D context from either an HTMLCanvasElement or OffscreenCanvas.
 * Throws if a 2D context is unavailable (keeps callers simple).
 */
export function get2D(canvas: HTMLCanvasElement | OffscreenCanvas): Ctx2D {
  // Use the same call; both canvases expose getContext("2d")
  const raw = (canvas as HTMLCanvasElement | OffscreenCanvas).getContext("2d");
  if (!isCtx2D(raw)) {
    throw new Error("2D context unavailable.");
  }
  return raw;
}

/**
 * Fetch a 2D context if present; return null otherwise.
 * Handy when you want to branch without try/catch.
 */
export function get2DOrNull(
  canvas: HTMLCanvasElement | OffscreenCanvas
): Ctx2D | null {
  const raw = (canvas as HTMLCanvasElement | OffscreenCanvas).getContext("2d");
  return isCtx2D(raw) ? raw : null;
}
