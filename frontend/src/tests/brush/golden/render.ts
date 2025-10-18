// FILE: tests/brush/golden/render.ts
// Headless render harness for golden tests.
// Works in Vitest (jsdom or node) via OffscreenCanvas, DOM canvas, or node-canvas.

import { drawStrokeToSurface } from "@/lib/brush/engine";
import type { RenderOptions } from "@/lib/brush/engine.types";

// ---- Local minimal types (keep strict & no `any`) ---------------------------

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

type HeadlessCanvas =
  | HTMLCanvasElement
  | OffscreenCanvas
  | {
      width: number;
      height: number;
      getContext: (
        id: "2d",
        opts?: CanvasRenderingContext2DSettings
      ) => Ctx2D | null;
      toBuffer?: (mime?: string) => Buffer;
    };

// Optional: minimal input sample type if you want to push live samples to engine
export type BrushInputSample = {
  x: number;
  y: number;
  t?: number; // ms
  pressure?: number; // 0..1
  tilt?: number; // 0..1
  angle?: number; // radians
  device?: "pen" | "mouse" | "touch";
  eraser?: boolean;
};

// ---- Canvas creation (Offscreen → DOM → node-canvas) ------------------------

function hasOffscreen(): boolean {
  return (
    typeof (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas !==
    "undefined"
  );
}
function hasDomCanvas(): boolean {
  return (
    typeof (globalThis as { document?: Document }).document !== "undefined" &&
    typeof (globalThis as { HTMLCanvasElement?: unknown }).HTMLCanvasElement !==
      "undefined"
  );
}

function createNodeCanvas(w: number, h: number): HeadlessCanvas {
  // Lazy require so file still loads in browser
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createCanvas } = require("canvas") as {
    createCanvas: (w: number, h: number) => HeadlessCanvas;
  };
  return createCanvas(w, h);
}

export function createTestCanvas(
  cssW: number,
  cssH: number,
  dpr: number
): { canvas: HeadlessCanvas; ctx: Ctx2D; pixelW: number; pixelH: number } {
  const pixelW = Math.max(1, Math.floor(cssW * dpr));
  const pixelH = Math.max(1, Math.floor(cssH * dpr));

  let canvas: HeadlessCanvas;
  if (hasOffscreen()) {
    canvas = new OffscreenCanvas(pixelW, pixelH);
  } else if (hasDomCanvas()) {
    const c = document.createElement("canvas");
    c.width = pixelW;
    c.height = pixelH;
    // Set CSS size for easier visual inspection when debugging in a browser
    if ("style" in c) {
      (c as HTMLCanvasElement).style.width = `${cssW}px`;
      (c as HTMLCanvasElement).style.height = `${cssH}px`;
    }
    canvas = c;
  } else {
    canvas = createNodeCanvas(pixelW, pixelH);
  }

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("2D context unavailable in test harness.");

  // Set transform so drawing uses CSS-space coords
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  return { canvas, ctx, pixelW, pixelH };
}

// ---- Render entry -----------------------------------------------------------

export type GoldenRenderOpts = Omit<RenderOptions, "width" | "height"> & {
  width: number;
  height: number;
  pixelRatio?: number;
  seed?: number;
  /** Fill background before rendering; null to keep transparent. */
  background?: string | null;
  /** Optional live input samples to feed the engine under test. */
  inputSamples?: ReadonlyArray<BrushInputSample>;
};

/**
 * Render a stroke into a headless canvas and return ImageData.
 * - Uses engine’s surface path so all DPR logic is identical to app.
 * - Deterministic by seed.
 */
export async function renderToImageData(
  opts: GoldenRenderOpts
): Promise<ImageData> {
  const cssW = Math.max(1, Math.floor(opts.width));
  const cssH = Math.max(1, Math.floor(opts.height));
  const dpr = Math.max(1, Math.floor(opts.pixelRatio ?? 1));

  const { canvas, ctx, pixelW, pixelH } = createTestCanvas(cssW, cssH, dpr);

  // Optional background fill (in device pixels)
  if (typeof opts.background === "string") {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    (ctx as CanvasRenderingContext2D).fillStyle = opts.background;
    (ctx as CanvasRenderingContext2D).fillRect(0, 0, pixelW, pixelH);
    ctx.restore();
  }

  // Build RenderOptions without undefined keys (keeps exactOptionalPropertyTypes happy)
  const roBase: RenderOptions = {
    engine: opts.engine,
    baseSizePx: opts.baseSizePx,
    width: cssW,
    height: cssH,
    ...(typeof opts.color === "string" ? { color: opts.color } : {}),
    ...(typeof opts.seed === "number" ? { seed: opts.seed } : {}),
    ...(typeof opts.pixelRatio === "number"
      ? { pixelRatio: opts.pixelRatio }
      : {}),
    ...(opts.path ? { path: opts.path } : {}),
    ...(opts.colorJitter ? { colorJitter: opts.colorJitter } : {}),
    ...(opts.overrides ? { overrides: opts.overrides } : {}),
    ...(opts.input ? { input: opts.input } : {}),
  };

  // If tests want to exercise input history, forward inputSamples
  const ro =
    opts.inputSamples && opts.inputSamples.length > 0
      ? ({
          ...roBase,
          inputSamples: opts.inputSamples,
        } as unknown as RenderOptions)
      : roBase;

  await drawStrokeToSurface(
    canvas as unknown as HTMLCanvasElement | OffscreenCanvas,
    ro
  );

  // Read pixels back in device space
  const img = (ctx as CanvasRenderingContext2D).getImageData(
    0,
    0,
    pixelW,
    pixelH
  );
  return img;
}

// ---- PNG helpers for debugging/goldens -------------------------------------

/** Return a PNG buffer (Node) or Uint8Array (browser) for the last render. */
export async function imageDataToPng(
  img: ImageData
): Promise<Uint8Array | Buffer> {
  const w = img.width;
  const h = img.height;

  // Prefer OffscreenCanvas if available
  let c: HeadlessCanvas;
  if (hasOffscreen()) c = new OffscreenCanvas(w, h);
  else if (hasDomCanvas()) {
    const el = document.createElement("canvas");
    el.width = w;
    el.height = h;
    c = el;
  } else {
    c = createNodeCanvas(w, h);
  }

  const ctx = c.getContext("2d", { alpha: true }) as Ctx2D;
  (ctx as CanvasRenderingContext2D).putImageData(img, 0, 0);

  // Node-canvas
  if ("toBuffer" in c && typeof c.toBuffer === "function") {
    return c.toBuffer("image/png");
  }

  // OffscreenCanvas
  if (
    typeof OffscreenCanvas !== "undefined" &&
    c instanceof OffscreenCanvas &&
    "convertToBlob" in c
  ) {
    const blob = await c.convertToBlob({ type: "image/png" });
    const buf = new Uint8Array(await blob.arrayBuffer());
    return buf;
  }

  // DOM Canvas fallback
  if (hasDomCanvas()) {
    const dataUrl = (c as HTMLCanvasElement).toDataURL("image/png");
    const b64 = dataUrl.split(",")[1] ?? "";
    const bin = (globalThis as unknown as { atob?: (s: string) => string }).atob
      ? (globalThis as unknown as { atob: (s: string) => string }).atob(b64)
      : Buffer.from(b64, "base64").toString("binary");
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  throw new Error("Unable to encode PNG in this environment.");
}

// ---- Comparison utilities ---------------------------------------------------

export type CompareStats = {
  /** Mean absolute error across RGBA channels (0..255). */
  mae: number;
  /** Root-mean-square error across RGBA channels (0..255). */
  rmse: number;
  /** Fraction of pixels exceeding `perChannelTolerance` on any channel. */
  outlierFrac: number;
};

/**
 * Compare two ImageData buffers of equal size.
 * Returns basic error metrics; use in expect() thresholds.
 */
export function compareImageData(
  a: ImageData,
  b: ImageData,
  perChannelTolerance = 0
): CompareStats {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `Dimension mismatch: ${a.width}x${a.height} vs ${b.width}x${b.height}`
    );
  }
  const da = a.data;
  const db = b.data;
  const n = da.length; // RGBA stride
  let sumAbs = 0;
  let sumSq = 0;
  let outliers = 0;

  for (let i = 0; i < n; i++) {
    const d = Math.abs(da[i]! - db[i]!);
    sumAbs += d;
    sumSq += d * d;
    if (perChannelTolerance > 0 && d > perChannelTolerance) outliers++;
  }

  const mae = sumAbs / n;
  const rmse = Math.sqrt(sumSq / n);
  const outlierFrac = perChannelTolerance > 0 ? outliers / n : 0;

  return { mae, rmse, outlierFrac };
}

// ---- Convenience: one-call render & compare to a golden ---------------------

/**
 * Given a function to load a golden ImageData (from file or fixture),
 * render current output and return comparison stats.
 */
export async function renderAndCompare(
  opts: GoldenRenderOpts,
  loadGolden: () => Promise<ImageData>,
  perChannelTolerance = 0
): Promise<CompareStats> {
  const out = await renderToImageData(opts);
  const golden = await loadGolden();
  return compareImageData(out, golden, perChannelTolerance);
}
