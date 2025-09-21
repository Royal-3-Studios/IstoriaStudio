// FILE: src/workers/brushWorker.ts
/* eslint-disable no-restricted-globals */

type WorkerGlobal = {
  postMessage: (
    message: import("@/lib/brush/workerTypes").WorkerResponse,
    transfer?: ImageBitmap[]
  ) => void;
};
const workerGlobal = self as unknown as WorkerGlobal;

import type {
  WorkerRequest,
  WorkerResponse,
  InitMsg,
  ResizeMsg,
  RenderStrokeMsg,
} from "@/lib/brush/workerTypes";

// import { drawStrokeToCanvas } from "@/lib/brush/engine"; // wire later

type Ctx2D = OffscreenCanvasRenderingContext2D;

let surface: OffscreenCanvas | null = null;
let ctx: Ctx2D | null = null;
let dpr = 1;

/* ----------------------------- helpers ----------------------------- */

function postMsg(msg: WorkerResponse, transfer?: ImageBitmap[]) {
  workerGlobal.postMessage(msg, transfer);
}

function ensureSurface(width: number, height: number, nextDpr: number) {
  const pixelW = Math.max(1, Math.floor(width * nextDpr));
  const pixelH = Math.max(1, Math.floor(height * nextDpr));

  if (!surface) {
    surface = new OffscreenCanvas(pixelW, pixelH);
    const got = surface.getContext("2d");
    if (!got) throw new Error("2D context unavailable in worker.");
    ctx = got as Ctx2D;
    dpr = nextDpr;
    return;
  }

  if (surface.width !== pixelW || surface.height !== pixelH) {
    surface.width = pixelW;
    surface.height = pixelH;
  }
  dpr = nextDpr;
}

function clearSurface(color?: string) {
  if (!surface || !ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (color) {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, surface.width, surface.height);
  } else {
    ctx.clearRect(0, 0, surface.width, surface.height);
  }
}

async function snapshotBitmap(): Promise<ImageBitmap> {
  if (!surface) throw new Error("Surface not initialized.");
  return await createImageBitmap(surface);
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
  try {
    const bmp = await snapshotBitmap();
    postMsg({ kind: "bitmap", bitmap: bmp }, [bmp]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    postMsg({ kind: "error", message });
  }
}

async function onRenderStroke(msg: RenderStrokeMsg) {
  try {
    if (!surface) throw new Error("Surface not initialized.");
    if (!ctx) throw new Error("2D context unavailable in worker.");

    // TODO: await drawStrokeToCanvas(surface, { ...msg.opts, path: msg.path });

    clearSurface();
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    if (msg.path.length > 0) {
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#888";
      ctx.moveTo(msg.path[0].x, msg.path[0].y);
      for (let i = 1; i < msg.path.length; i++) {
        const p = msg.path[i];
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();

      const end = msg.path[msg.path.length - 1];
      ctx.beginPath();
      ctx.fillStyle = "#4a90e2";
      ctx.arc(end.x, end.y, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "#f0f0f0";
      ctx.fillRect(0, 0, surface.width / dpr, surface.height / dpr);
    }

    ctx.restore();

    const bmp = await snapshotBitmap();
    postMsg({ kind: "bitmap", bitmap: bmp }, [bmp]);
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
          await onSnapshot(); // no arg
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
