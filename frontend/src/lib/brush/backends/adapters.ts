// FILE: src/lib/brush/backends/adapters.ts
import type {
  BackendAdapter,
  CanvasSurface,
  RenderStrokeOptions,
} from "./types";

export type { BackendAdapter } from "./types";

/* ------------------------------ helpers ------------------------------ */

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// Narrow a rendering context to 2D (HTML or Offscreen)
function is2DContext(
  ctx: unknown
): ctx is CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  if (!ctx || typeof ctx !== "object") return false;
  const c = ctx as Partial<CanvasRenderingContext2D>;
  return typeof c.fillRect === "function" && typeof c.beginPath === "function";
}

function getCtx2D(
  surface: CanvasSurface
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const ctx = surface.getContext("2d");
  if (!is2DContext(ctx)) throw new Error("2D context unavailable");
  return ctx;
}

function pickPixelRatio(opts: { pixelRatio?: number; dpr?: number }): number {
  if (isFiniteNumber(opts.pixelRatio)) return opts.pixelRatio;
  if (isFiniteNumber(opts.dpr)) return opts.dpr; // legacy alias
  return 1;
}

function pressureOf(pt: { p?: number; pressure?: number }): number {
  if (isFiniteNumber(pt.p)) return pt.p;
  if (isFiniteNumber(pt.pressure)) return pt.pressure;
  return 0.6;
}

function toSafeColor(color?: unknown): string {
  return typeof color === "string" ? color : "rgba(70,160,255,0.9)";
}

/* Sanitize an arbitrary path into strongly-typed points with guaranteed x,y */
type XY = { x: number; y: number };
type XYPressure = XY & {
  p?: number;
  pressure?: number;
  angle?: number;
  tilt?: number;
  t?: number;
};

function hasXY(u: unknown): u is { x: unknown; y: unknown } {
  return typeof u === "object" && u !== null && "x" in u && "y" in u;
}

function getNum(
  obj: Record<string, unknown>,
  key: keyof Record<string, unknown>
): number | undefined {
  const v = obj[key as string];
  return isFiniteNumber(v) ? (v as number) : undefined;
}

function sanitizePath(
  raw: RenderStrokeOptions["path"] | undefined
): XYPressure[] {
  const out: XYPressure[] = [];
  for (const pt of raw ?? []) {
    if (!hasXY(pt)) continue;
    const r = pt as Record<string, unknown>;
    const x = getNum(r, "x");
    const y = getNum(r, "y");
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) continue;

    const p = getNum(r, "p");
    const pressure = getNum(r, "pressure");
    const angle = getNum(r, "angle");
    const tilt = getNum(r, "tilt");
    const t = getNum(r, "t");

    const obj: XYPressure = { x, y };
    if (isFiniteNumber(p)) obj.p = p;
    if (isFiniteNumber(pressure)) obj.pressure = pressure;
    if (isFiniteNumber(angle)) obj.angle = angle;
    if (isFiniteNumber(tilt)) obj.tilt = tilt;
    if (isFiniteNumber(t)) obj.t = t;
    out.push(obj);
  }
  return out;
}

/* --------------------------- example backends --------------------------- */

// Example CPU impl (synchronous path draw). Replace with your engine call.
async function cpuBasicRender(
  canvas: CanvasSurface,
  opts: RenderStrokeOptions
): Promise<void> {
  const ctx = getCtx2D(canvas);

  // DPR transform (we draw in CSS units)
  const pr = pickPixelRatio(opts);
  ctx.setTransform(pr, 0, 0, pr, 0, 0);

  // clear
  const w = Math.max(1, Math.floor(opts.width));
  const h = Math.max(1, Math.floor(opts.height));
  ctx.clearRect(0, 0, w, h);

  // simple stroke shader (for visibility)
  ctx.globalCompositeOperation = "source-over";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // path is already sanitized to XYPressure[]
  const path: XYPressure[] = sanitizePath(opts.path);
  if (path.length < 2) return;

  const strokeColor = toSafeColor((opts as { color?: string }).color);

  let prev: XYPressure | null = null;
  for (const curr of path) {
    if (prev) {
      const p = pressureOf(curr);
      ctx.lineWidth = 1 + p * 8;
      ctx.strokeStyle = strokeColor;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(curr.x, curr.y);
      ctx.stroke();
    }
    prev = curr;
  }
}

// Example worker impl: post message to your worker, get bitmap back, then draw it
async function workerRender(
  canvas: CanvasSurface,
  opts: RenderStrokeOptions
): Promise<void> {
  await cpuBasicRender(canvas, opts);
}

// Example GPU impl: swap this to your WebGL/WebGPU path
async function gpuFastRender(
  canvas: CanvasSurface,
  opts: RenderStrokeOptions
): Promise<void> {
  await cpuBasicRender(canvas, opts);
}

/* ------------------------------- registry ------------------------------- */

export const BACKEND_ADAPTERS: readonly BackendAdapter[] = [
  { id: "cpu-basic", name: "cpu-basic", renderStroke: cpuBasicRender },
  { id: "gpu-fast", name: "gpu-fast", renderStroke: gpuFastRender },
  { id: "worker", name: "worker", renderStroke: workerRender },
] as const;
