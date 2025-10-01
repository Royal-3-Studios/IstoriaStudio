// FILE: src/workers/brushWorker.ts
import type { RenderPathPoint } from "@/lib/brush/engine";
type WorkerGlobal = {
  postMessage: (
    message: import("@/lib/brush/workerTypes").WorkerResponse,
    transfer?: Transferable[]
  ) => void;
};
const workerGlobal = self as unknown as WorkerGlobal;

import { drawStrokeToSurface } from "@/lib/brush/engine";

import type {
  WorkerRequest,
  WorkerResponse,
  InitMsg,
  ResizeMsg,
  RenderStrokeMsg,
} from "@/lib/brush/workerTypes";

type Ctx2D = OffscreenCanvasRenderingContext2D;

let surface: OffscreenCanvas | null = null;
let ctx: Ctx2D | null = null;
let dpr = 1;

// Monotonic token to drop stale renders/snapshots
let taskToken = 0;

/* ----------------------------- helpers ----------------------------- */

function postMsg(msg: WorkerResponse, transfer?: Transferable[]) {
  workerGlobal.postMessage(msg, transfer);
}

function ensureSurface(width: number, height: number, nextDpr: number) {
  const pixelW = Math.max(1, Math.floor(width * nextDpr));
  const pixelH = Math.max(1, Math.floor(height * nextDpr));

  if (!surface) {
    surface = new OffscreenCanvas(pixelW, pixelH);
    const got = surface.getContext("2d", { alpha: true });
    if (!got) throw new Error("2D context unavailable in worker.");
    ctx = got;
    dpr = nextDpr;
    return;
  }

  if (surface.width !== pixelW || surface.height !== pixelH) {
    surface.width = pixelW;
    surface.height = pixelH;
  }
  dpr = nextDpr;
}

function resetTransform() {
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function clearSurface(color?: string) {
  if (!surface || !ctx) return;
  resetTransform();
  if (color) {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, surface.width, surface.height);
  } else {
    ctx.clearRect(0, 0, surface.width, surface.height);
  }
}

/** Prefer zero-copy when available; fallback to createImageBitmap. */
async function makeBitmap(): Promise<ImageBitmap> {
  if (!surface) throw new Error("Surface not initialized.");

  if (typeof surface.transferToImageBitmap === "function") {
    return surface.transferToImageBitmap();
  }
  return await createImageBitmap(surface);
}

/** Transfer bitmap to main thread, or close if stale. */
function postBitmap(bmp: ImageBitmap, token: number) {
  if (token !== taskToken) {
    try {
      bmp.close();
    } catch {
      /* noop */
    }
    return;
  }
  workerGlobal.postMessage({ kind: "bitmap", bitmap: bmp }, [bmp]);
}

/* --------------------------- message handlers --------------------------- */

async function onInit(msg: InitMsg) {
  ensureSurface(msg.width, msg.height, msg.dpr ?? 1);
  clearSurface();
  postMsg({ kind: "ack", for: "init" });
}

async function onResize(msg: ResizeMsg) {
  ensureSurface(msg.width, msg.height, msg.dpr ?? dpr);
  clearSurface();
  postMsg({ kind: "ack", for: "resize" });
}

async function onPing() {
  postMsg({ kind: "pong" });
}

async function onSnapshot() {
  const myToken = ++taskToken;
  try {
    const bmp = await makeBitmap();
    postBitmap(bmp, myToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    postMsg({ kind: "error", message });
  }
}

async function onRenderStroke(msg: RenderStrokeMsg) {
  const myToken = ++taskToken;
  try {
    if (!surface) throw new Error("Surface not initialized.");
    if (!ctx) throw new Error("2D context unavailable in worker.");

    const logicalW =
      msg.opts.width ?? Math.max(1, Math.floor(surface.width / dpr));
    const logicalH =
      msg.opts.height ?? Math.max(1, Math.floor(surface.height / dpr));
    const pixelRatio = msg.opts.pixelRatio ?? dpr;

    // Convert readonly WorkerPathPoint[] -> mutable RenderPathPoint[]
    const path: RenderPathPoint[] = msg.path.map((pt) => ({
      x: pt.x,
      y: pt.y,
      ...(pt.pressure !== undefined ? { p: pt.pressure } : {}),
    }));

    await drawStrokeToSurface(surface, {
      ...msg.opts,
      width: logicalW,
      height: logicalH,
      pixelRatio,
      path, // <- now mutable RenderPathPoint[]
    });

    const bmp = await makeBitmap();
    postBitmap(bmp, myToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    postMsg({ kind: "error", message });
  }
}

/* -------------------------------- router -------------------------------- */

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  (async () => {
    try {
      switch (msg.kind) {
        case "init":
          await onInit(msg);
          break;
        case "resize":
          await onResize(msg);
          break;
        case "ping":
          await onPing();
          break;
        case "snapshot":
          await onSnapshot();
          break;
        case "renderStroke":
          await onRenderStroke(msg);
          break;
        default: {
          const maybeKind = (msg as { kind?: unknown }).kind;
          const k = typeof maybeKind === "string" ? maybeKind : "unknown";
          postMsg({ kind: "error", message: `Unknown message: ${k}` });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      postMsg({ kind: "error", message });
    }
  })();
};
