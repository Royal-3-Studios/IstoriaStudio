// ========================
// FILE: src/lib/canvas/context.ts
// ========================

/** Unified 2D context & canvas types you can import from app code. */
export type Ctx2D =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;
export type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

/* ---------- Basic type guards ---------- */

export function isCanvas2DContext(v: unknown): v is Ctx2D {
  // Minimal feature test shared by both 2D contexts
  const c = v as Partial<CanvasRenderingContext2D>;
  return (
    !!v &&
    typeof c.drawImage === "function" &&
    !!(c as { canvas?: unknown }).canvas
  );
}

/* ---------- Layer creation ---------- */

/**
 * Create an offscreen/onscreen canvas layer in CSS pixels.
 * SSR-safe: throws if neither OffscreenCanvas nor DOM is available.
 */
export function createLayer(w: number, h: number): CanvasLike {
  // Prefer OffscreenCanvas when available (no DOM required)
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(w, h);
  }

  // Fallback to DOM Canvas if we're in the browser
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  // No canvas available (likely SSR)
  throw new Error("Canvas is not available in this environment.");
}

/* ---------- Context acquisition ---------- */

/**
 * Get a 2D context from either HTMLCanvasElement or OffscreenCanvas.
 * Throws if unavailable. Defaults to { alpha: true }.
 */
export function get2D(
  canvas: CanvasLike,
  opts: CanvasRenderingContext2DSettings = { alpha: true }
): Ctx2D {
  const ctx =
    (canvas as HTMLCanvasElement | OffscreenCanvas).getContext?.("2d", opts) ??
    null;

  if (!isCanvas2DContext(ctx)) {
    throw new Error("2D context not available.");
  }
  return ctx;
}

/**
 * Backward-compat alias. Use `get2D` in new code.
 */
export function get2DContext(
  canvas: CanvasLike,
  opts: CanvasRenderingContext2DSettings = { alpha: true }
): Ctx2D {
  return get2D(canvas, opts);
}
