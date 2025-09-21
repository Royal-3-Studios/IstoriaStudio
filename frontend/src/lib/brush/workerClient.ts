// FILE: src/lib/brush/workerClient.ts

import type {
  WorkerRequest,
  WorkerResponse,
  BitmapResponse,
  WorkerRenderOptions,
  WorkerPathPoint,
} from "@/lib/brush/workerTypes";
import {
  isBitmapResponse,
  isAck,
  isError,
  isPong,
} from "@/lib/brush/workerTypes";
import {
  drawStrokeToCanvas,
  type RenderOptions,
  type RenderPathPoint,
  type EngineConfig,
  type RenderOverrides,
} from "@/lib/brush/engine";

// Use shared 2D utils instead of local guards
import { type Ctx2D, get2DOrNull } from "@/lib/brush/backends/utils/ctx2d";

/* ----------------------------- runtime guards ----------------------------- */

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}
function isEngineConfigLike(x: unknown): x is EngineConfig {
  return isObject(x);
}
function isOverridesLike(x: unknown): x is Partial<RenderOverrides> {
  return isObject(x);
}
function toRenderPath(
  points: ReadonlyArray<WorkerPathPoint>
): RenderPathPoint[] {
  return points.map((p) => ({
    x: p.x,
    y: p.y,
    pressure: typeof p.pressure === "number" ? p.pressure : undefined,
    angle: typeof p.angle === "number" ? p.angle : undefined,
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
      reject(
        new Error(String((e as { message?: string } | null)?.message ?? e))
      );
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
    (m): m is WorkerResponse & { kind: "ack"; for: "init" } =>
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

export async function renderStrokeToLayer(
  handle: WorkerHandle,
  layerCanvas: HTMLCanvasElement | OffscreenCanvas,
  opts: WorkerRenderOptions,
  path: ReadonlyArray<WorkerPathPoint>,
  seed?: number
): Promise<void> {
  /* Fallback: main-thread engine */
  if (!handle.useWorker || !handle.worker) {
    const engineConfig: EngineConfig = isEngineConfigLike(opts.engine)
      ? opts.engine
      : {};
    const overrides: Partial<RenderOverrides> | undefined = isOverridesLike(
      opts.overrides
    )
      ? opts.overrides
      : undefined;

    const ropts: RenderOptions = {
      engine: engineConfig,
      baseSizePx: opts.baseSizePx,
      color: typeof opts.color === "string" ? opts.color : "#000000",
      width: opts.width,
      height: opts.height,
      seed,
      pixelRatio:
        typeof opts.pixelRatio === "number" ? opts.pixelRatio : undefined,
      path: toRenderPath(path),
      overrides,
    };

    if (layerCanvas instanceof HTMLCanvasElement) {
      await drawStrokeToCanvas(layerCanvas, ropts);
    } else {
      // OffscreenCanvas on main thread: draw via a temp HTMLCanvas and blit
      const temp = document.createElement("canvas");
      temp.width = layerCanvas.width;
      temp.height = layerCanvas.height;
      await drawStrokeToCanvas(temp, ropts);
      const bmp = await createImageBitmap(temp);
      const ctx = get2D(layerCanvas);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
      ctx.drawImage(bmp, 0, 0);
    }
    return;
  }

  /* Worker path */
  const req: WorkerRequest = {
    kind: "renderStroke",
    layerId: undefined,
    opts,
    path,
    seed,
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
