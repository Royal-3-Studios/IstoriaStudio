// FILE: src/lib/brush/workerClient.ts
import type {
  WorkerRequest,
  WorkerResponse,
  BitmapResponse,
  WorkerRenderOptions,
  WorkerPathPoint,
} from "@/lib/brush/messages";
import { isBitmapResponse, isAck, isError, isPong } from "@/lib/brush/messages";

import {
  drawStrokeToCanvas,
  type RenderOptions,
  type RenderPathPoint,
  type EngineConfig,
  type RenderOverrides,
} from "@/lib/brush/engine";

import { type Ctx2D, get2DOrNull } from "@/lib/brush/backends/utils/canvas";

/* -------------------------- tiny runtime helpers -------------------------- */

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}
function isEngineConfigLike(x: unknown): x is EngineConfig {
  return isObject(x); // keep narrow; real validation belongs elsewhere
}
function isOverridesLike(x: unknown): x is Partial<RenderOverrides> {
  return isObject(x);
}

/** Map WorkerPathPoint[] → RenderPathPoint[] without ever assigning `undefined`. */
function toRenderPath(
  points: ReadonlyArray<WorkerPathPoint>
): RenderPathPoint[] {
  return points.map<RenderPathPoint>((p) => ({
    x: p.x,
    y: p.y,
    ...(typeof p.pressure === "number" ? { pressure: p.pressure } : {}),
    ...(typeof p.angle === "number" ? { angle: p.angle } : {}),
  }));
}

/** Throwing convenience wrapper around shared helper. */
function get2D(canvas: HTMLCanvasElement | OffscreenCanvas): Ctx2D {
  const ctx = get2DOrNull(canvas);
  if (!ctx) throw new Error("2D context unavailable.");
  return ctx;
}

/* ----------------------------- worker handle ----------------------------- */

export type WorkerHandle = {
  worker: Worker | null;
  supportsOffscreen: boolean;
  useWorker: boolean;
  dispose: () => void;
};

function hasWorker(): boolean {
  return typeof Worker !== "undefined";
}
function hasOffscreen(): boolean {
  return typeof OffscreenCanvas !== "undefined";
}

/* One-in-flight wait helper */
function waitFor<T extends WorkerResponse>(
  w: Worker,
  predicate: (m: WorkerResponse) => m is T,
  abortSignal?: AbortSignal
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onMessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      if (predicate(msg)) {
        cleanup();
        resolve(msg);
      } else if (isError(msg)) {
        cleanup();
        reject(new Error(msg.message));
      }
    };
    const onError = (e: unknown) => {
      cleanup();
      const m =
        typeof e === "object" &&
        e !== null &&
        "message" in (e as Record<PropertyKey, unknown>)
          ? String((e as { message?: string }).message)
          : String(e);
      reject(new Error(m));
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const cleanup = () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError as EventListener);
      abortSignal?.removeEventListener?.("abort", onAbort);
    };

    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError as EventListener);
    abortSignal?.addEventListener?.("abort", onAbort);
  });
}

/* --------------------------------- API ---------------------------------- */

export function startBrushWorker(): WorkerHandle {
  const supports = hasWorker() && hasOffscreen();
  if (!supports) {
    return {
      worker: null,
      supportsOffscreen: false,
      useWorker: false,
      dispose: () => {},
    };
  }

  const worker = new Worker(
    new URL("../../workers/brushWorker.ts", import.meta.url),
    { type: "module", name: "brush-worker" }
  );

  return {
    worker,
    supportsOffscreen: true,
    useWorker: true,
    dispose: () => worker.terminate(),
  };
}

export async function initBrushSurface(
  handle: WorkerHandle,
  width: number,
  height: number,
  dpr: number
): Promise<void> {
  if (!handle.useWorker || !handle.worker) return;
  const msg: WorkerRequest = { kind: "init", width, height, dpr };
  handle.worker.postMessage(msg);
  await waitFor(
    handle.worker,
    (m): m is WorkerResponse & { kind: "ack"; for: "init"; version?: number } =>
      isAck(m) && m.for === "init"
  );
}

export async function resizeBrushSurface(
  handle: WorkerHandle,
  width: number,
  height: number,
  dpr: number
): Promise<void> {
  if (!handle.useWorker || !handle.worker) return;
  const msg: WorkerRequest = { kind: "resize", width, height, dpr };
  handle.worker.postMessage(msg);
  await waitFor(
    handle.worker,
    (m): m is WorkerResponse & { kind: "ack"; for: "resize" } =>
      isAck(m) && m.for === "resize"
  );
}

/**
 * Render a stroke into a layer canvas.
 * Falls back to main-thread rendering if workers/offscreens aren’t available.
 */
export async function renderStrokeToLayer(
  handle: WorkerHandle,
  layerCanvas: HTMLCanvasElement | OffscreenCanvas,
  opts: WorkerRenderOptions,
  path: ReadonlyArray<WorkerPathPoint>,
  seed?: number
): Promise<void> {
  /* Fallback: main-thread engine */
  if (!handle.useWorker || !handle.worker) {
    // opts.engine is already EngineConfig per your messages.ts
    const engineConfig: EngineConfig = isEngineConfigLike(opts.engine)
      ? opts.engine
      : (() => {
          throw new Error("Invalid engine config");
        })();

    const overrides: Partial<RenderOverrides> | undefined = isOverridesLike(
      opts.overrides
    )
      ? opts.overrides
      : undefined;

    // Build RenderOptions without assigning `undefined` to optional fields
    const base: RenderOptions = {
      engine: engineConfig,
      baseSizePx: opts.baseSizePx,
      color: typeof opts.color === "string" ? opts.color : "#000000",
      width: opts.width,
      height: opts.height,
      // If your RenderOptions requires `seed` (not optional), provide a default:
      // Replace `?? 0` with your preferred default if you want deterministic runs.
      seed: seed ?? 0,
      path: toRenderPath(path),
      ...(typeof opts.pixelRatio === "number"
        ? { pixelRatio: opts.pixelRatio }
        : {}),
      ...(overrides ? { overrides } : {}),
    };

    if (layerCanvas instanceof HTMLCanvasElement) {
      await drawStrokeToCanvas(layerCanvas, base);
    } else {
      // OffscreenCanvas on main thread: render into a temp HTMLCanvas and blit
      const temp = document.createElement("canvas");
      temp.width = layerCanvas.width;
      temp.height = layerCanvas.height;
      await drawStrokeToCanvas(temp, base);
      const bmp = await createImageBitmap(temp);
      const ctx = get2D(layerCanvas);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
      ctx.drawImage(bmp, 0, 0);
      if (typeof bmp.close === "function") bmp.close();
    }
    return;
  }

  /* Worker path: never include undefined fields (exactOptionalPropertyTypes) */
  const req: WorkerRequest = {
    kind: "renderStroke",
    // layerId intentionally omitted; add it if/when you support multiple layers:
    // ...(layerId ? { layerId } : {}),
    opts,
    path,
    ...(typeof seed === "number" ? { seed } : {}),
  };
  handle.worker.postMessage(req);

  const bmpMsg = await waitFor(handle.worker, (m): m is BitmapResponse =>
    isBitmapResponse(m)
  );
  const bmp = bmpMsg.bitmap;

  const ctx = get2D(layerCanvas);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
  ctx.drawImage(bmp, 0, 0);
  if (typeof bmp.close === "function") bmp.close();
}

export async function snapshotBrushSurface(
  handle: WorkerHandle
): Promise<ImageBitmap | null> {
  if (!handle.useWorker || !handle.worker) return null;
  const req: WorkerRequest = { kind: "snapshot" };
  handle.worker.postMessage(req);
  const bmpMsg = await waitFor(handle.worker, (m): m is BitmapResponse =>
    isBitmapResponse(m)
  );
  return bmpMsg.bitmap;
}

export async function pingBrushWorker(handle: WorkerHandle): Promise<boolean> {
  if (!handle.useWorker || !handle.worker) return false;
  const req: WorkerRequest = { kind: "ping" };
  handle.worker.postMessage(req);
  await waitFor(handle.worker, (m): m is WorkerResponse & { kind: "pong" } =>
    isPong(m)
  );
  return true;
}
