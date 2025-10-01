// ========================
// FILE: src/lib/canvas/context.ts
// ========================
import { CanvasUtil } from "@backends";

/** Unified 2D context & canvas types you can import from app code. */
export type Ctx2D =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;
export type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

/* ---------- Narrowers for optional helpers on CanvasUtil ---------- */

type CreateLayerFn = (
  w: number,
  h: number
) => HTMLCanvasElement | OffscreenCanvas;
type Get2DContextFn = (
  canvas: CanvasLike,
  opts?: CanvasRenderingContext2DSettings
) => Ctx2D;

function hasCreateLayer(obj: unknown): obj is { createLayer: CreateLayerFn } {
  const o = obj as { createLayer?: unknown };
  return typeof o?.createLayer === "function";
}

function hasGet2DContext(
  obj: unknown
): obj is { get2DContext: Get2DContextFn } {
  const o = obj as { get2DContext?: unknown };
  return typeof o?.get2DContext === "function";
}

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

/** Create an offscreen/onscreen layer in CSS pixels. */
export function createLayer(w: number, h: number): CanvasLike {
  // Prefer the backend’s canonical helper if available.
  if (hasCreateLayer(CanvasUtil)) {
    return CanvasUtil.createLayer(w, h);
  }

  // Fallback: try OffscreenCanvas first, then DOM canvas
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(w, h);
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/* ---------- Context acquisition ---------- */

/** One place to get a 2D ctx (and throw if unavailable). */
export function get2DContext(
  canvas: CanvasLike,
  opts: CanvasRenderingContext2DSettings = { alpha: true }
): Ctx2D {
  // Prefer the backend’s canonical helper if available.
  if (hasGet2DContext(CanvasUtil)) {
    const ctx = CanvasUtil.get2DContext(canvas, opts);
    if (!isCanvas2DContext(ctx)) throw new Error("2D context not available.");
    return ctx;
  }

  // Fallback: use the native getContext on either canvas type
  const ctx =
    (canvas as HTMLCanvasElement | OffscreenCanvas).getContext?.("2d", opts) ??
    null;

  if (!isCanvas2DContext(ctx)) {
    throw new Error("2D context not available.");
  }
  return ctx;
}
