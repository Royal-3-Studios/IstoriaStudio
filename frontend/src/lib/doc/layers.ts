// FILE: src/lib/painting/layers.ts
// Minimal in-memory layer stack with composite, resize, and snapshot helpers.

export type BlendMode = GlobalCompositeOperation;

export interface Layer {
  id: string;
  name: string;
  opacity: number; // 0..1
  blend: BlendMode; // e.g. "source-over"
  visible: boolean;
  canvas: HTMLCanvasElement | OffscreenCanvas;
}

export interface LayerStack {
  width: number; // CSS px (logical)
  height: number; // CSS px (logical)
  dpr: number; // device pixel ratio to size backing stores
  layers: Layer[];
  activeId: string | null;
}

/* ------------------------------ Utilities ------------------------------ */

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function isCtx2D(ctx: unknown): ctx is Ctx2D {
  if (!ctx || typeof ctx !== "object") return false;
  const c = ctx as Partial<CanvasRenderingContext2D>;
  return (
    typeof c.clearRect === "function" &&
    typeof c.drawImage === "function" &&
    typeof c.getImageData === "function" &&
    typeof c.setTransform === "function"
  );
}

function get2D(c: HTMLCanvasElement | OffscreenCanvas): Ctx2D {
  const ctx = c.getContext("2d", { alpha: true }) as Ctx2D | null;
  if (!isCtx2D(ctx)) throw new Error("2D context unavailable");
  return ctx;
}

function pixelSize(cssW: number, cssH: number, dpr: number) {
  return {
    w: Math.max(1, Math.floor(cssW * dpr)),
    h: Math.max(1, Math.floor(cssH * dpr)),
  };
}

function sizeCanvas(
  c: HTMLCanvasElement | OffscreenCanvas,
  pixelW: number,
  pixelH: number
): void {
  (c as HTMLCanvasElement | OffscreenCanvas).width = pixelW;
  (c as HTMLCanvasElement | OffscreenCanvas).height = pixelH;
}

export function createCanvas(
  w: number,
  h: number
): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/* ----------------------------- Stack & Layers ----------------------------- */

export function createStack(
  width: number,
  height: number,
  dpr = 1
): LayerStack {
  return { width, height, dpr, layers: [], activeId: null };
}

export function addLayer(
  stack: LayerStack,
  name: string,
  opts?: Partial<Pick<Layer, "opacity" | "blend" | "visible">>
): Layer {
  const id =
    (globalThis as unknown as { crypto?: Crypto }).crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

  const { w, h } = pixelSize(stack.width, stack.height, stack.dpr);
  const canvas = createCanvas(w, h);
  sizeCanvas(canvas, w, h);

  const layer: Layer = {
    id,
    name,
    opacity: opts?.opacity ?? 1,
    blend: opts?.blend ?? "source-over",
    visible: opts?.visible ?? true,
    canvas,
  };
  stack.layers.push(layer);
  stack.activeId ||= id;
  return layer;
}

export function findLayer(stack: LayerStack, id: string): Layer | null {
  return stack.layers.find((l) => l.id === id) ?? null;
}

export function setActiveLayer(stack: LayerStack, id: string | null): void {
  stack.activeId = id;
}

export function removeLayer(stack: LayerStack, id: string): Layer | null {
  const i = stack.layers.findIndex((l) => l.id === id);
  if (i < 0) return null;
  const [removed] = stack.layers.splice(i, 1);
  if (stack.activeId === id) stack.activeId = stack.layers.at(-1)?.id ?? null;
  return removed;
}

export function moveLayer(
  stack: LayerStack,
  id: string,
  newIndex: number
): void {
  const i = stack.layers.findIndex((l) => l.id === id);
  if (i < 0) return;
  const [l] = stack.layers.splice(i, 1);
  const idx = Math.max(0, Math.min(stack.layers.length, newIndex));
  stack.layers.splice(idx, 0, l);
}

export function setLayerVisibility(layer: Layer, visible: boolean): void {
  layer.visible = visible;
}
export function setLayerOpacity(layer: Layer, opacity01: number): void {
  layer.opacity = Math.max(0, Math.min(1, opacity01));
}
export function setLayerBlend(layer: Layer, blend: BlendMode): void {
  layer.blend = blend;
}

export function clearLayer(layer: Layer): void {
  const ctx = get2D(layer.canvas);
  const w = (layer.canvas as HTMLCanvasElement | OffscreenCanvas).width;
  const h = (layer.canvas as HTMLCanvasElement | OffscreenCanvas).height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
}

/**
 * Resize the stack (CSS size and/or DPR) and rescale all layer backstores.
 * If `preserve` is true (default), content is scaled into the new size.
 */
export function resizeStack(
  stack: LayerStack,
  width: number,
  height: number,
  dpr = stack.dpr,
  preserve = true
): void {
  const prevW = stack.width;
  const prevH = stack.height;
  const prevDpr = stack.dpr;

  stack.width = Math.max(1, Math.floor(width));
  stack.height = Math.max(1, Math.floor(height));
  stack.dpr = Math.max(1, dpr);

  const prevPx = pixelSize(prevW, prevH, prevDpr);
  const nextPx = pixelSize(stack.width, stack.height, stack.dpr);

  for (const l of stack.layers) {
    if (preserve && prevPx.w !== 0 && prevPx.h !== 0) {
      // draw into a temp and then back after resize for scaling preservation
      const tmp = createCanvas(prevPx.w, prevPx.h);
      sizeCanvas(tmp, prevPx.w, prevPx.h);
      const tc = get2D(tmp);
      tc.drawImage(l.canvas, 0, 0);

      sizeCanvas(l.canvas, nextPx.w, nextPx.h);
      const lc = get2D(l.canvas);
      lc.setTransform(1, 0, 0, 1, 0, 0);
      lc.clearRect(0, 0, nextPx.w, nextPx.h);
      lc.drawImage(tmp, 0, 0, prevPx.w, prevPx.h, 0, 0, nextPx.w, nextPx.h);
    } else {
      sizeCanvas(l.canvas, nextPx.w, nextPx.h);
      clearLayer(l);
    }
  }
}

/* ----------------------------- Compositing ----------------------------- */

export function compositeTo(
  stack: LayerStack,
  target: HTMLCanvasElement | OffscreenCanvas,
  bg?: { color?: string }
): void {
  const { w: tw, h: th } = pixelSize(stack.width, stack.height, stack.dpr);

  // Ensure target backing store matches stack pixel size
  sizeCanvas(target, tw, th);

  const tctx = get2D(target);
  tctx.setTransform(1, 0, 0, 1, 0, 0);

  if (bg?.color) {
    tctx.globalCompositeOperation = "source-over";
    tctx.globalAlpha = 1;
    (tctx as CanvasRenderingContext2D).fillStyle = bg.color;
    tctx.fillRect(0, 0, tw, th);
  } else {
    tctx.clearRect(0, 0, tw, th);
  }

  for (const l of stack.layers) {
    if (!l.visible || l.opacity <= 0) continue;
    tctx.globalCompositeOperation = l.blend;
    tctx.globalAlpha = Math.max(0, Math.min(1, l.opacity));
    tctx.drawImage(l.canvas, 0, 0);
  }

  tctx.globalAlpha = 1;
  tctx.globalCompositeOperation = "source-over";
}

/* ------------------------------ Snapshots ------------------------------ */

export type LayerSnapshot = ImageBitmap | ImageData;

export async function snapshotLayer(layer: Layer): Promise<LayerSnapshot> {
  const c = layer.canvas;
  if (typeof createImageBitmap === "function") {
    // ImageBitmap preserves premultiplied alpha and is fast to copy/composite
    return await createImageBitmap(c as unknown as CanvasImageSource);
  }
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable for snapshot");
  return (ctx as CanvasRenderingContext2D).getImageData(
    0,
    0,
    (c as HTMLCanvasElement | OffscreenCanvas).width,
    (c as HTMLCanvasElement | OffscreenCanvas).height
  );
}

export function restoreLayer(layer: Layer, snap: LayerSnapshot): void {
  const c = layer.canvas;
  const ctx = get2D(c);
  const w = (c as HTMLCanvasElement | OffscreenCanvas).width;
  const h = (c as HTMLCanvasElement | OffscreenCanvas).height;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (typeof ImageData !== "undefined" && snap instanceof ImageData) {
    (ctx as CanvasRenderingContext2D).putImageData(snap, 0, 0);
  } else {
    ctx.drawImage(snap as unknown as CanvasImageSource, 0, 0);
  }
}
