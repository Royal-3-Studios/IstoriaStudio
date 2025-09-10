// src/lib/brush/backends/wet.ts
/**
 * Wet backend (lightweight stub):
 * 1) Renders a base stroke via stamping (soft tips, modest spacing)
 * 2) Adds a wet-edges look:
 *    - blurred underlay (bleed)
 *    - optional dark rim = (blur - base), multiplied back
 * Swap with real fluid sim later if desired.
 */

import { EngineConfig } from "./ribbon";
import { drawStampingToCanvas as drawStamping } from "./stamping";

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

type RenderOptions = {
  engine: EngineConfig;
  baseSizePx: number;
  color?: string;
  width: number;
  height: number;
  seed?: number;
  path?: Array<{ x: number; y: number; angle?: number }>;
  colorJitter?: { h?: number; s?: number; l?: number; perStamp?: boolean };
  overrides?: Partial<{
    spacing: number;
    jitter: number;
    scatter: number;
    count: number;
    angle: number;
    softness: number;
    flow: number;
    wetEdges: boolean; // stronger dark rim if true
    grainKind: "none" | "paper" | "canvas" | "noise";
    grainScale: number;
    grainDepth: number;
    grainRotate: number;
  }>;
};

function is2DContext(ctx: unknown): ctx is Ctx2D {
  if (!ctx || typeof ctx !== "object") return false;
  const c = ctx as Record<string, unknown>;
  return typeof c.drawImage === "function" && "canvas" in c;
}

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  throw new Error("No canvas implementation available.");
}

export async function drawWetToCanvas(
  canvas: HTMLCanvasElement,
  opt: RenderOptions
): Promise<void> {
  const dpr =
    typeof window !== "undefined"
      ? Math.max(1, window.devicePixelRatio || 1)
      : 1;

  const targetW = Math.max(1, Math.floor(opt.width || 352));
  const targetH = Math.max(1, Math.floor(opt.height || 128));

  if (canvas instanceof HTMLCanvasElement) {
    canvas.style.width = `${targetW}px`;
    canvas.style.height = `${targetH}px`;
  }
  canvas.width = Math.max(1, Math.floor(targetW * dpr));
  canvas.height = Math.max(1, Math.floor(targetH * dpr));

  const ctx = canvas.getContext("2d");
  if (!is2DContext(ctx)) throw new Error("2D context not available.");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, targetW, targetH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // ---------- 1) Base stroke via stamping ----------
  const off = makeCanvas(targetW * dpr, targetH * dpr);
  const offCtx = (off as OffscreenCanvas | HTMLCanvasElement).getContext("2d");
  if (!is2DContext(offCtx)) throw new Error("2D context not available.");
  offCtx.setTransform(1, 0, 0, 1, 0, 0);
  offCtx.clearRect(0, 0, targetW * dpr, targetH * dpr);

  await drawStamping(off as unknown as HTMLCanvasElement, {
    ...opt,
    baseSizePx: Math.max(2, (opt.baseSizePx || 8) * 1.0),
    engine: {
      ...opt.engine,
      strokePath: {
        ...(opt.engine?.strokePath ?? {}),
        spacing: opt.overrides?.spacing ?? opt.engine?.strokePath?.spacing ?? 5,
        jitter: opt.overrides?.jitter ?? opt.engine?.strokePath?.jitter ?? 6,
        scatter: opt.overrides?.scatter ?? opt.engine?.strokePath?.scatter ?? 2,
        count: opt.overrides?.count ?? opt.engine?.strokePath?.count ?? 1,
      },
      shape: {
        ...(opt.engine?.shape ?? {}),
        softness: opt.overrides?.softness ?? opt.engine?.shape?.softness ?? 70,
      },
    },
    overrides: {
      ...opt.overrides,
      flow: opt.overrides?.flow ?? 60,
    },
    width: targetW,
    height: targetH,
  });

  // ---------- 2) Wet look: blur underlay + optional rim ----------
  // Blur underlay (separate canvas; avoid self-blur pitfalls)
  const blur = makeCanvas(targetW * dpr, targetH * dpr);
  const bctx = (blur as OffscreenCanvas | HTMLCanvasElement).getContext("2d");
  if (!is2DContext(bctx)) throw new Error("2D context not available.");
  bctx.setTransform(1, 0, 0, 1, 0, 0);
  bctx.clearRect(0, 0, targetW * dpr, targetH * dpr);
  (bctx as CanvasRenderingContext2D).filter = "blur(2px)";
  bctx.drawImage(off as CanvasImageSource, 0, 0);
  (bctx as CanvasRenderingContext2D).filter = "none";

  // Dark rim = (blur - base)
  const rim = makeCanvas(targetW * dpr, targetH * dpr);
  const rctx = (rim as OffscreenCanvas | HTMLCanvasElement).getContext("2d");
  if (!is2DContext(rctx)) throw new Error("2D context not available.");
  rctx.setTransform(1, 0, 0, 1, 0, 0);
  rctx.clearRect(0, 0, targetW * dpr, targetH * dpr);
  rctx.drawImage(blur as CanvasImageSource, 0, 0);
  rctx.globalCompositeOperation = "destination-out"; // subtract base
  rctx.drawImage(off as CanvasImageSource, 0, 0);
  rctx.globalCompositeOperation = "source-over";

  // Composite sequence on main:
  // a) blurred underlay (slight bleed)
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 0.85;
  ctx.drawImage(blur as CanvasImageSource, 0, 0, targetW, targetH);

  // b) base stroke on top (opaque core)
  ctx.globalAlpha = 1;
  ctx.drawImage(off as CanvasImageSource, 0, 0, targetW, targetH);

  // c) optional darker rim
  if (opt.overrides?.wetEdges) {
    ctx.globalCompositeOperation = "multiply";
    (ctx as CanvasRenderingContext2D).filter = "blur(0.7px)";
    ctx.globalAlpha = 0.25;
    ctx.drawImage(rim as CanvasImageSource, 0, 0, targetW, targetH);
    (ctx as CanvasRenderingContext2D).filter = "none";
  }

  // reset
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

export default drawWetToCanvas;
