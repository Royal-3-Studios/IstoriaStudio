// FILE: src/lib/brush/backends/ribbon/variants/ink.ts
import type { RenderOptions, RenderOverrides } from "@/lib/brush/engine.types";
import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer, get2D } from "@backends/utils/canvas";
import {
  resamplePath, // resamples {x,y,t,p}
  resolveSpacingFraction, // UI spacing -> fraction of diameter
} from "@backends/utils/stroke";

type Sample = { x: number; y: number; t: number; p: number };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** Rotate a 2D vector (x,y) by angle radians. */
function rot2(x: number, y: number, angle: number): { x: number; y: number } {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return { x: x * c - y * s, y: x * s + y * c };
}

/** Build a ribbon Path2D from resampled points + radius function + optional normal rot. */
function buildRibbonOutline(
  samples: ReadonlyArray<Sample>,
  radiusAt: (u: number) => number,
  normalRotateRad: (i: number) => number
): Path2D {
  const n = samples.length;
  const left: Array<{ x: number; y: number }> = [];
  const right: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < n; i++) {
    const a = samples[Math.max(0, i - 1)]!;
    const b = samples[Math.min(n - 1, i + 1)]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 1;

    // base normal
    let nx = -dy / L;
    let ny = dx / L;

    // subtle rotation of the silhouette normal (tilt-driven)
    const theta = normalRotateRad(i);
    if (theta !== 0) {
      const r = rot2(nx, ny, theta);
      nx = r.x;
      ny = r.y;
    }

    const r = Math.max(0, radiusAt(samples[i]!.t));
    left.push({ x: samples[i]!.x - nx * r, y: samples[i]!.y - ny * r });
    right.push({ x: samples[i]!.x + nx * r, y: samples[i]!.y + ny * r });
  }

  const path = new Path2D();
  path.moveTo(left[0]!.x, left[0]!.y);
  for (let i = 1; i < n; i++) path.lineTo(left[i]!.x, left[i]!.y);
  for (let i = n - 1; i >= 0; i--) path.lineTo(right[i]!.x, right[i]!.y);
  path.closePath();
  return path;
}

/** Ink variant: solid, pressure-shaped ribbon with tilt→size & subtle rotation. */
export function drawRibbonInk(ctx: Ctx2D, opt: RenderOptions): void {
  const path = opt.path ?? [];
  if (path.length < 2) return;

  const color = opt.color ?? "#000000";
  const ov = (opt.engine.overrides ?? {}) as Partial<RenderOverrides>;

  const flow01 = clamp01(((ov.flow as number | undefined) ?? 100) / 100);
  const opacity01 = clamp01(((ov.opacity as number | undefined) ?? 100) / 100);

  const viewW = Math.max(1, Math.floor(opt.width));
  const viewH = Math.max(1, Math.floor(opt.height));

  // Base radius (CSS px)
  const baseRadius = Math.max(0.5, (opt.baseSizePx ?? 10) * 0.5);

  // Spacing -> step (px)
  const uiSpacing =
    opt.engine.strokePath?.spacing ?? (ov.spacing as number | undefined) ?? 6;
  const spacingFrac = resolveSpacingFraction(uiSpacing, 6);
  const stepPx = Math.max(0.4, Math.min(3.0, baseRadius * spacingFrac));

  // Resample to even steps (x,y,t,p)
  const samples = resamplePath(path, stepPx);
  if (samples.length < 2) return;

  // --- Tilt routing ---------------------------------------------------------
  const tiltToSize = ov.tiltToSize ?? 0; // 0..1
  const tiltToFan = ov.tiltToFan ?? 0; // reused as a subtle rotation strength

  // Average tilt across original points (cheap & stable)
  const tiltVals: number[] = [];
  for (let i = 0; i < path.length; i++) {
    const t = (path[i] as { tilt?: number }).tilt;
    if (isNum(t)) tiltVals.push(clamp01(t));
  }
  const avgTilt01 = tiltVals.length
    ? tiltVals.reduce((a, b) => a + b, 0) / tiltVals.length
    : 0;

  // Subtle rotation cap (radians). ~12° feels nice without wobble.
  const ROT_MAX = Math.PI / 15;

  // Taper knobs
  const tipScaleStart = isNum(ov.tipScaleStart) ? ov.tipScaleStart : 0.85;
  const tipScaleEnd = isNum(ov.tipScaleEnd) ? ov.tipScaleEnd : 0.85;
  const tipMinPx = isNum(ov.tipMinPx) ? Math.max(0, ov.tipMinPx) : 0;
  const endBias = isNum(ov.endBias) ? ov.endBias : 0;
  const uniformity = isNum(ov.uniformity) ? ov.uniformity : 0;

  // Radius profile from pressure + taper + tilt→size
  const radiusAt = (u: number): number => {
    const idx = Math.max(
      0,
      Math.min(samples.length - 1, Math.floor(u * (samples.length - 1)))
    );
    const s = samples[idx]!;
    const p = clamp01(s.p);

    // Base width from pressure (ink slightly fuller than pencil)
    const base = baseRadius * (0.72 + 0.62 * Math.pow(p, 0.85));

    // Start/end taper
    const sCurve = 1 - u; // toward start
    const eCurve = u; // toward end
    let scale = 1.0;
    scale *= 1 + (tipScaleStart - 1) * sCurve;
    scale *= 1 + (tipScaleEnd - 1) * eCurve;

    // End-bias fattens/thins end vs start
    if (endBias !== 0) {
      const bias = endBias > 0 ? u : 1 - u;
      scale *= 1 + 0.25 * Math.abs(endBias) * bias;
    }

    // Uniformity pushes toward flat marker look
    if (uniformity > 0) {
      scale = (1 - uniformity) * scale + uniformity * 1.0;
    }

    // --- Tilt → size --------------------------------------------------------
    const tiltSizeMul = 1 + clamp01(tiltToSize) * avgTilt01;

    const widthPx = Math.max(0, base * scale * 2 * tiltSizeMul);
    const r = Math.max(tipMinPx * 0.5, widthPx * 0.5);
    return r;
  };

  // Per-sample normal rotation function (constant subtle bias here).
  const normalRotateRad = (_i: number): number =>
    ROT_MAX * clamp01(tiltToFan) * avgTilt01;

  // Build polygonal outline
  const outline = buildRibbonOutline(samples, radiusAt, normalRotateRad);

  // Draw into a temp layer to apply flow, then composite with opacity
  const layer = createLayer(viewW, viewH);
  const lx = get2D(layer);

  lx.save();
  lx.globalCompositeOperation = "source-over";
  lx.globalAlpha = flow01;
  (lx as CanvasRenderingContext2D).fillStyle = color;
  lx.fill(outline);
  lx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = opacity01;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}
