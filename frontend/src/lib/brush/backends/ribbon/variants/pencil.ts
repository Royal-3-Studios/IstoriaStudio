// FILE: src/lib/brush/backends/ribbon/variants/pencil.ts
import type { RenderOptions, RenderOverrides } from "@/lib/brush/engine";
import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer, get2D } from "@backends/utils/canvas";
import {
  resamplePath, // resamples {x,y,t,p}
  resolveSpacingFraction, // UI spacing -> fraction of diameter
  computeWidthScale, // 0..1 taper/uniformity/endBias shaping
  type SamplePoint as StrokeSample,
} from "@backends/utils/stroke";

type Sample = { x: number; y: number; t: number; p: number };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* ------------------------- local helpers (typed) ------------------------- */

/** Build a ribbon Path2D from resampled points + radius function. */
function buildRibbonOutline(
  samples: ReadonlyArray<Sample>,
  radiusAt: (u: number) => number
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
    const nx = -dy / L;
    const ny = dx / L;

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

/** Draw a blurred band stroke along the centerline (multiply, etc). */
function strokeBand(
  ctx: Ctx2D,
  centerline: ReadonlyArray<{ x: number; y: number }>,
  opts: {
    lineWidth: number;
    alpha: number;
    composite: GlobalCompositeOperation;
    blurPx: number;
    color: string;
  }
): void {
  if (centerline.length < 2) return;
  const { lineWidth, alpha, composite, blurPx, color } = opts;

  const prevComp = ctx.globalCompositeOperation;
  const prevAlpha = ctx.globalAlpha;
  const prevFilter = (ctx as CanvasRenderingContext2D).filter;

  ctx.globalCompositeOperation = composite;
  ctx.globalAlpha = clamp01(alpha);
  (ctx as CanvasRenderingContext2D).strokeStyle = color;
  (ctx as CanvasRenderingContext2D).lineCap = "round";
  (ctx as CanvasRenderingContext2D).lineJoin = "round";
  (ctx as CanvasRenderingContext2D).lineWidth = Math.max(0.5, lineWidth);
  (ctx as CanvasRenderingContext2D).filter = `blur(${Math.max(0, blurPx)}px)`;

  ctx.beginPath();
  ctx.moveTo(centerline[0]!.x, centerline[0]!.y);
  for (let i = 1; i < centerline.length; i++) {
    const p = centerline[i]!;
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();

  // restore
  (ctx as CanvasRenderingContext2D).filter = prevFilter ?? "none";
  ctx.globalAlpha = prevAlpha;
  ctx.globalCompositeOperation = prevComp;
}

/** Destination-in tip fade along the stroke axis (light ends). */
function applyTipFade(
  ctx: Ctx2D,
  start: { x: number; y: number },
  end: { x: number; y: number },
  tipMinAlpha: number,
  viewW: number,
  viewH: number
): void {
  const a = clamp01(tipMinAlpha);
  const grad = (ctx as CanvasRenderingContext2D).createLinearGradient(
    start.x,
    start.y,
    end.x,
    end.y
  );
  grad.addColorStop(0.0, `rgba(0,0,0,${a.toFixed(2)})`);
  grad.addColorStop(0.08, "rgba(0,0,0,1.0)");
  grad.addColorStop(0.92, "rgba(0,0,0,1.0)");
  grad.addColorStop(1.0, `rgba(0,0,0,${a.toFixed(2)})`);

  const prevComp = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "destination-in";
  (ctx as CanvasRenderingContext2D).fillStyle = grad;
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.globalCompositeOperation = prevComp;
}

/* --------------------------------- main ---------------------------------- */

export function drawRibbonPencil(ctx: Ctx2D, opt: RenderOptions): void {
  const path = opt.path ?? [];
  if (path.length < 2) return;

  const color = opt.color ?? "#000000";
  const ov = (opt.engine.overrides ?? {}) as Partial<RenderOverrides>;

  const flow01 = clamp01(((ov.flow as number | undefined) ?? 100) / 100);
  const opacity01 = clamp01(((ov.opacity as number | undefined) ?? 100) / 100);

  const viewW = Math.max(1, Math.floor(opt.width));
  const viewH = Math.max(1, Math.floor(opt.height));

  // Base radius (CSS px)
  const baseRadius = Math.max(0.5, (opt.baseSizePx ?? 8) * 0.5);

  // Spacing -> step (px)
  const uiSpacing =
    opt.engine.strokePath?.spacing ?? (ov.spacing as number | undefined) ?? 6;
  const spacingFrac = resolveSpacingFraction(uiSpacing, 6);
  const stepPx = Math.max(0.4, Math.min(3.0, baseRadius * spacingFrac));

  // Resample to even steps (x,y,t,p)
  const samplesRaw: StrokeSample[] = resamplePath(path, stepPx);
  if (samplesRaw.length < 2) return;
  // Narrow to the local Sample type
  const samples: Sample[] = samplesRaw.map((s) => ({
    x: s.x,
    y: s.y,
    t: s.t,
    p: s.p,
  }));

  // Taper/uniformity knobs for width shaping
  const tipScaleStart =
    typeof ov.tipScaleStart === "number" ? ov.tipScaleStart : 0.85;
  const tipScaleEnd =
    typeof ov.tipScaleEnd === "number" ? ov.tipScaleEnd : 0.85;
  const tipMinPx =
    typeof ov.tipMinPx === "number" ? Math.max(0, ov.tipMinPx) : 0;
  const endBias = typeof ov.endBias === "number" ? ov.endBias : 0;
  const uniformity = typeof ov.uniformity === "number" ? ov.uniformity : 0;

  // Pressure + taper → width (px) → radius
  const radiusAt = (u: number): number => {
    const i = Math.max(
      0,
      Math.min(samples.length - 1, Math.floor(u * (samples.length - 1)))
    );
    const s = samples[i]!;
    const p = clamp01(s.p);

    const baseWidth = baseRadius * 2 * (0.7 + 0.6 * Math.pow(p, 0.85)); // pencil slightly thinner than ink
    const scale = computeWidthScale(u, {
      baseSizePx: baseRadius * 2, // only influences spacing conversion elsewhere; harmless here
      spacingPercent: 6, // unused here; computeWidthScale ignores it
      tipScaleStart,
      tipScaleEnd,
      endBias,
      uniformity,
    });

    const widthPx = Math.max(0, baseWidth * scale);
    return Math.max(tipMinPx * 0.5, widthPx * 0.5);
  };

  // Outline mask
  const outline = buildRibbonOutline(samples, radiusAt);

  // Offscreen layer and clip
  const layer = createLayer(viewW, viewH);
  const lx = get2D(layer);
  lx.save();
  lx.clip(outline);

  // 1) Base body fill
  lx.globalCompositeOperation = "source-over";
  lx.globalAlpha = flow01 * 0.62 * opacity01;
  (lx as CanvasRenderingContext2D).fillStyle = color;
  lx.fillRect(0, 0, viewW, viewH);

  // Centerline for band passes
  const center: Array<{ x: number; y: number }> = samples.map((s) => ({
    x: s.x,
    y: s.y,
  }));

  // 2) Opacity spine (soft, multiply)
  strokeBand(lx, center, {
    lineWidth: Math.max(1, baseRadius * 1.6),
    alpha: clamp01(opacity01 * 0.4),
    composite: "multiply",
    blurPx: 0.55,
    color,
  });

  // 3) Plate band (multiply)
  strokeBand(lx, center, {
    lineWidth: Math.max(1, baseRadius * 2.0),
    alpha: clamp01(opacity01 * 0.16),
    composite: "multiply",
    blurPx: 0.6,
    color,
  });

  // 4) Two glaze passes (multiply)
  strokeBand(lx, center, {
    lineWidth: Math.max(1, baseRadius * 1.34),
    alpha: clamp01(opacity01 * 0.62),
    composite: "multiply",
    blurPx: 0.52,
    color,
  });
  strokeBand(lx, center, {
    lineWidth: Math.max(1, baseRadius * 1.58),
    alpha: clamp01(opacity01 * 0.34),
    composite: "multiply",
    blurPx: 0.52,
    color,
  });

  // 5) Tip fade (destination-in). Pencil has light ends.
  applyTipFade(lx, center[0]!, center[center.length - 1]!, 0.25, viewW, viewH);

  lx.restore();

  // Final composite (pencil looks right in multiply)
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 1.0;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}
