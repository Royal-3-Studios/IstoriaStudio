// FILE: src/lib/brush/backends/wet.ts
/**
 * Wet backend — soft watercolor/ink wash with wet-edge darkening,
 * inner bloom/bleed, and pressure-driven pooling.
 *
 * - Reads: baseSizePx, overrides.flow/opacity, engine.rendering.wetEdges
 * - Input: opt.path (x,y,angle?,pressure?)
 * - Output: draws into given canvas (DPR-aware)
 */

import type { RenderOptions } from "../engine";

/* ========================================================================== *
 * Small utilities (fully typed)
 * ========================================================================== */

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function createCanvas(
  w: number,
  h: number
): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function isCtx2D(
  ctx: unknown
): ctx is CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  if (!ctx || typeof ctx !== "object") return false;
  const c = ctx as Partial<CanvasRenderingContext2D>;
  return (
    typeof c.clearRect === "function" &&
    typeof c.setTransform === "function" &&
    typeof c.drawImage === "function" &&
    typeof c.createRadialGradient === "function"
  );
}

function getCtx2D(
  canvas: HTMLCanvasElement | OffscreenCanvas
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!isCtx2D(ctx)) throw new Error("2D context not available.");
  return ctx;
}

/* ========================================================================== *
 * Path helpers
 * ========================================================================== */

type InputPoint = { x: number; y: number; angle?: number; pressure?: number };
type SamplePoint = {
  x: number;
  y: number;
  angle: number;
  pressure: number;
  arcLen: number;
};

function createDefaultPreviewPath(width: number, height: number): InputPoint[] {
  const out: InputPoint[] = [];
  const x0 = Math.max(8, Math.floor(width * 0.08));
  const x1 = Math.min(width - 8, Math.floor(width * 0.92));
  const midY = Math.floor(height * 0.58);
  const amp = Math.max(8, Math.min(height * 0.33, 36));
  const steps = 72;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = midY - amp * t + amp * 0.5 * Math.sin(6.3 * t);
    const dx = (x1 - x0) / steps;
    const dy = -amp / steps + (amp * 0.5 * 6.3 * Math.cos(6.3 * t)) / steps;
    out.push({
      x,
      y,
      angle: Math.atan2(dy, dx),
      pressure: 0.7 + 0.3 * Math.sin(3.0 * t),
    });
  }
  return out;
}

/** Resample by arc step; carry angle & pressure; arcLen monotonically increases. */
function resamplePathUniform(path: InputPoint[], step: number): SamplePoint[] {
  if (!path.length) return [];

  const prefix: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    prefix[i] = prefix[i - 1] + Math.hypot(dx, dy);
  }
  const totalLen = prefix[prefix.length - 1];
  if (totalLen <= 0) return [];

  const arcAt = (
    s: number
  ): { x: number; y: number; angle: number; pressure: number } => {
    let i = 1;
    while (i < prefix.length && prefix[i] < s) i++;
    const i1 = Math.min(prefix.length - 1, Math.max(1, i));
    const s0 = prefix[i1 - 1];
    const s1 = prefix[i1];
    const t = Math.min(1, Math.max(0, (s - s0) / Math.max(1e-6, s1 - s0)));
    const a = path[i1 - 1];
    const b = path[i1];

    const angle =
      a.angle != null && b.angle != null
        ? lerp(a.angle, b.angle, t)
        : Math.atan2(b.y - a.y, b.x - a.x);
    const pressure = lerp(a.pressure ?? 1, b.pressure ?? 1, t);
    return {
      x: lerp(a.x, b.x, t),
      y: lerp(a.y, b.y, t),
      angle,
      pressure: clamp01(pressure),
    };
  };

  const out: SamplePoint[] = [];
  for (let s = 0; s <= totalLen; s += step) {
    const p = arcAt(s);
    out.push({
      x: p.x,
      y: p.y,
      angle: p.angle,
      pressure: p.pressure,
      arcLen: s,
    });
  }
  if (out[out.length - 1]?.arcLen < totalLen) {
    const p = arcAt(totalLen);
    out.push({
      x: p.x,
      y: p.y,
      angle: p.angle,
      pressure: p.pressure,
      arcLen: totalLen,
    });
  }
  return out;
}

/* ========================================================================== *
 * Core wet look helpers
 * ========================================================================== */

function pressureToRadiusK(p01: number): number {
  const q = clamp01(p01);
  return 0.8 + Math.pow(q, 0.8) * 0.6; // 0.8..1.4
}

function pressureToFlowK(p01: number): number {
  const q = clamp01(p01);
  return 0.55 + Math.pow(q, 1.1) * 0.75; // 0.55..1.3
}

/** Paint a soft round dab at (x,y) with radius r and opacity a. */
function paintDab(
  ctx: Ctx2D,
  x: number,
  y: number,
  r: number,
  a: number
): void {
  const grd = ctx.createRadialGradient(x, y, 0, x, y, Math.max(0.001, r));
  grd.addColorStop(0.0, `rgba(0,0,0,${(a * 0.65).toFixed(4)})`);
  grd.addColorStop(0.55, `rgba(0,0,0,${(a * 0.85).toFixed(4)})`);
  grd.addColorStop(1.0, `rgba(0,0,0,0)`);
  ctx.fillStyle = grd;
  const d = r * 2;
  ctx.fillRect(x - r, y - r, d, d);
}

/* ========================================================================== *
 * Main renderer (canvas-based; handles its own DPR)
 * ========================================================================== */

export async function drawWetToCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opt: RenderOptions
): Promise<void> {
  // DPR + sizing
  const dpr: number =
    typeof window !== "undefined"
      ? Math.min(opt.pixelRatio ?? window.devicePixelRatio ?? 1, 2)
      : Math.max(1, opt.pixelRatio ?? 1);

  const viewW: number = Math.max(1, Math.floor(opt.width));
  const viewH: number = Math.max(1, Math.floor(opt.height));

  if (
    typeof HTMLCanvasElement !== "undefined" &&
    canvas instanceof HTMLCanvasElement
  ) {
    canvas.style.width = `${viewW}px`;
    canvas.style.height = `${viewH}px`;
  }
  canvas.width = Math.max(1, Math.floor(viewW * dpr));
  canvas.height = Math.max(1, Math.floor(viewH * dpr));

  const ctx = getCtx2D(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Inputs
  const flow01: number = clamp01(
    ((opt.overrides?.flow ?? opt.engine?.overrides?.flow ?? 100) as number) /
      100
  );
  const opacity01: number = clamp01(
    ((opt.overrides?.opacity ??
      opt.engine?.overrides?.opacity ??
      100) as number) / 100
  );
  const baseRadius: number = Math.max(0.5, (opt.baseSizePx || 8) * 0.5);
  const strokeColor = opt.color ?? "#000000";

  // Respect rendering mode, engine overrides, and runtime overrides for wet edges
  const wetEdgesEnabled =
    (opt.overrides?.wetEdges ??
      opt.engine?.overrides?.wetEdges ??
      opt.engine?.rendering?.wetEdges ??
      opt.engine?.rendering?.mode === "wet") === true;

  // Path
  const inputPath: InputPoint[] =
    opt.path && opt.path.length > 1
      ? (opt.path as InputPoint[])
      : createDefaultPreviewPath(viewW, viewH);

  const arcStep: number = Math.max(0.42, baseRadius * 0.18);
  const samples: SamplePoint[] = resamplePathUniform(inputPath, arcStep);
  if (!samples.length) return;

  /* A) Accumulate mask (wet pigment deposit, grayscale) */
  const mask = createCanvas(viewW, viewH);
  const mx = getCtx2D(mask);
  mx.clearRect(0, 0, viewW, viewH);
  mx.globalCompositeOperation = "source-over";
  mx.filter = "none";

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const r = baseRadius * pressureToRadiusK(s.pressure);
    const a = opacity01 * flow01 * 0.22 * pressureToFlowK(s.pressure);
    paintDab(mx, s.x, s.y, Math.max(0.5, r), a);
  }

  /* B) Diffusion (soft bleed) */
  mx.filter = "blur(0.9px)";
  mx.drawImage(mask as CanvasImageSource, 0, 0);
  mx.filter = "none";

  /* C) Wet edge emphasis */
  if (wetEdgesEnabled) {
    const edge = createCanvas(viewW, viewH);
    const ex = getCtx2D(edge);
    ex.clearRect(0, 0, viewW, viewH);
    ex.drawImage(mask as CanvasImageSource, 0, 0);

    ex.globalCompositeOperation = "source-over";
    ex.filter = "blur(1.6px)";
    ex.drawImage(edge as CanvasImageSource, 0, 0);
    ex.filter = "none";

    ex.globalCompositeOperation = "destination-out";
    ex.filter = "blur(0.9px)";
    ex.drawImage(mask as CanvasImageSource, 0, 0);
    ex.filter = "none";
    ex.globalCompositeOperation = "source-over";

    mx.globalCompositeOperation = "multiply";
    mx.globalAlpha = opacity01 * clamp01(flow01 * 0.9);
    mx.drawImage(edge as CanvasImageSource, 0, 0);
    mx.globalAlpha = 1;
    mx.globalCompositeOperation = "source-over";
  }

  /* D) Inner bloom (watery lift) */
  {
    const bloom = createCanvas(viewW, viewH);
    const bx = getCtx2D(bloom);
    bx.clearRect(0, 0, viewW, viewH);
    bx.drawImage(mask as CanvasImageSource, 0, 0);

    bx.globalCompositeOperation = "source-over";
    bx.filter = "blur(1.8px)";
    bx.drawImage(bloom as CanvasImageSource, 0, 0);
    bx.filter = "none";

    bx.globalCompositeOperation = "destination-in";
    bx.filter = "blur(0.6px)";
    bx.drawImage(mask as CanvasImageSource, 0, 0);
    bx.filter = "none";
    bx.globalCompositeOperation = "source-over";

    mx.globalCompositeOperation = "screen";
    mx.globalAlpha = opacity01 * 0.22;
    mx.drawImage(bloom as CanvasImageSource, 0, 0);
    mx.globalAlpha = 1;
    mx.globalCompositeOperation = "source-over";
  }

  /* E) Core reinforcement */
  {
    const first = samples[0];
    const last = samples[samples.length - 1];
    mx.globalCompositeOperation = "multiply";
    const core = mx.createLinearGradient(first.x, first.y, last.x, last.y);
    core.addColorStop(0.0, "rgba(0,0,0,0.15)");
    core.addColorStop(0.5, "rgba(0,0,0,0.30)");
    core.addColorStop(1.0, "rgba(0,0,0,0.15)");
    mx.fillStyle = core;
    mx.fillRect(0, 0, viewW, viewH);
    mx.globalCompositeOperation = "source-over";
  }

  /* F) Tint with stroke color, clip by mask, draw to destination */
  const tinted = createCanvas(viewW, viewH);
  const tx = getCtx2D(tinted);
  tx.clearRect(0, 0, viewW, viewH);

  // Fill solid color
  tx.fillStyle = strokeColor;
  tx.fillRect(0, 0, viewW, viewH);

  // Clip by wet mask
  tx.globalCompositeOperation = "destination-in";
  tx.drawImage(mask as CanvasImageSource, 0, 0);
  tx.globalCompositeOperation = "source-over";

  // Composite to destination (engine-level final blend/opacity still applies)
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(tinted as CanvasImageSource, 0, 0);
}

export default drawWetToCanvas;
