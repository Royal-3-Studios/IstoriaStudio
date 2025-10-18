import type {
  RenderOptions,
  RenderOverrides,
  EngineStrokePath,
  RenderPathPoint,
} from "@/lib/brush/engine.types";
import type { CanvasLike } from "@backends/utils/canvas";
import type { WetOptions, DrawWetToCanvas } from "../types";

// Optional core helpers (use if present)
import * as Edges from "../core/edges"; // you already have these files
import * as Fluid from "../core/fluid";
import * as Paper from "../core/paper";
import * as Lift from "../core/lift";

/* ------------------------------ local helpers ------------------------------ */

function must<T>(v: T | null | undefined, where: string): T {
  if (v == null) throw new Error(`wet: ${where} is undefined`);
  return v;
}
const num = (v: unknown, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : d;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Path → concrete list
function toPoints(
  path: EngineStrokePath | Iterable<RenderPathPoint>
): RenderPathPoint[] {
  return Array.isArray(path)
    ? (path as unknown as RenderPathPoint[])
    : Array.from(path as Iterable<RenderPathPoint>);
}

function pressure(pt: { p?: number; pressure?: number }) {
  return typeof pt.p === "number"
    ? pt.p
    : typeof pt.pressure === "number"
      ? pt.pressure
      : 1;
}

/** Get 2D context from a CanvasLike. */
function get2D(surface: CanvasLike): CanvasRenderingContext2D {
  const ctx = (surface as HTMLCanvasElement).getContext("2d");
  return must(ctx as CanvasRenderingContext2D | null, "2D context");
}

/* ------------------------------- main draw -------------------------------- */

/**
 * Minimal wet brush pass:
 * 1) Build a soft body alpha on a mask layer (pressure-sized round stamps).
 * 2) Color layer = brush color clipped by mask (like wash/glaze).
 * 3) Optional: apply fluid diffusion / pooling / paper tooth / wet-edges if available.
 * 4) Composite to destination using global opacity/flow.
 */
export const drawWetToCanvas: DrawWetToCanvas = (
  surface,
  path,
  options,
  _overrides
) => {
  const ctx = get2D(surface);
  const pts = toPoints(path);
  if (pts.length < 2) return;

  const W = Math.max(1, Math.floor(options.width));
  const H = Math.max(1, Math.floor(options.height));

  const baseSizePx = Math.max(0.5, num((options as any).baseSizePx, 12));
  const color = (options as any).color ?? "#000000";
  const comp =
    (options as any)?.engine?.rendering?.blendMode ??
    (options as any)?.engine?.overrides?.composite ??
    ("source-over" as GlobalCompositeOperation);

  // Resolved wet options
  const wet = options.wet;
  const flow01 = clamp01(wet.flow01);
  const opacity01 = clamp01(wet.opacity01);

  // 1) Build a mask from round, overlapping stamps (pressure-sized)
  const mask = document.createElement("canvas");
  mask.width = W;
  mask.height = H;
  const mx = must(mask.getContext("2d", { alpha: true }), "mask ctx");
  mx.fillStyle = "#000";
  mx.globalCompositeOperation = "source-over";

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const pr = clamp01(pressure(p));
    const r = 0.5 * baseSizePx * (0.65 + 0.7 * Math.pow(pr, 0.9));
    if (r <= 0.25) continue;

    mx.globalAlpha = 0.5 + 0.5 * pr; // tighter body center, softer edges
    mx.beginPath();
    mx.arc(p.x, p.y, Math.max(0.5, r), 0, Math.PI * 2, false);
    mx.fill();
  }

  // 2) Paint layer (wash) = color clipped by mask
  const paint = document.createElement("canvas");
  paint.width = W;
  paint.height = H;
  const px = must(paint.getContext("2d", { alpha: true }), "paint ctx");
  px.fillStyle = color;
  px.fillRect(0, 0, W, H);

  // clip by mask
  px.globalCompositeOperation = "destination-in";
  px.drawImage(mask, 0, 0);
  px.globalCompositeOperation = "source-over";

  // 3) Optional wet passes (if your modules export compatible helpers)
  try {
    // Paper tooth / granulation (optional): darken/texture inside mask
    if (Paper && typeof (Paper as any).applyPaperTooth === "function") {
      (Paper as any).applyPaperTooth(px, {
        granulation: clamp01(wet.granulation),
        depth: num(options.engine.grain?.depth, 0.3),
        scale: num(options.engine.grain?.scale, 1),
        seed: (options.seed ?? 0) | 0,
      });
    }

    // Edge darkening / capillary (optional)
    if (
      wet.wetEdges &&
      Edges &&
      typeof (Edges as any).applyWetEdges === "function"
    ) {
      (Edges as any).applyWetEdges(px, mask, {
        gain: Math.max(0, wet.edgeGain),
        radiusPx: Math.max(0.25, wet.edgeRadiusPx),
      });
    }

    // Diffusion / pooling (optional)
    if (Fluid && typeof (Fluid as any).diffuse === "function") {
      (Fluid as any).diffuse(px, {
        diffusion: Math.max(0, wet.diffusion),
        pooling: Math.max(0, wet.pooling),
        iterations: Math.max(0, wet.iterations),
        stepPx: Math.max(1, wet.stepPx),
      });
    }

    // Pickup/lift (optional): simulate paper pickup (lightening) based on pickup strength
    if (
      wet.pickup > 0 &&
      Lift &&
      typeof (Lift as any).applyLift === "function"
    ) {
      (Lift as any).applyLift(px, { amount: clamp01(wet.pickup / 2) });
    }
  } catch {
    // Silently ignore optional module errors to keep base stroke working.
  }

  // 4) Composite to destination
  ctx.save();
  ctx.globalCompositeOperation = comp;
  ctx.globalAlpha = opacity01 * flow01;
  ctx.drawImage(paint, 0, 0);
  ctx.restore();
};

export default drawWetToCanvas;
