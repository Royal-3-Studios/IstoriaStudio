// FILE: src/lib/brush/backends/ribbon/variants/marker.ts
import type { RenderOptions, RenderOverrides } from "@/lib/brush/engine";
import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer, get2D } from "@backends/utils/canvas";
import {
  resamplePath, // resamples {x,y,t,p}
  resolveSpacingFraction, // UI spacing -> fraction of diameter
  computeWidthScale, // taper/uniformity shaping
  type SamplePoint as StrokeSample,
} from "@/lib/brush/backends/utils/stroke";

type Sample = { x: number; y: number; t: number; p: number };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* ------------------------- local helpers (typed) ------------------------- */

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

/** Destination-in tip fade along stroke axis (light marker ends). */
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

export function drawRibbonMarker(ctx: Ctx2D, opt: RenderOptions): void {
  const path = opt.path ?? [];
  if (path.length < 2) return;

  const color = opt.color ?? "#000000";
  const ov = (opt.engine.overrides ?? {}) as Partial<RenderOverrides>;

  const flow01 = clamp01(((ov.flow as number | undefined) ?? 100) / 100);
  const opacity01 = clamp01(((ov.opacity as number | undefined) ?? 100) / 100);

  const viewW = Math.max(1, Math.floor(opt.width));
  const viewH = Math.max(1, Math.floor(opt.height));

  // Marker is a bit broader than pencil by default
  const baseRadius = Math.max(0.5, (opt.baseSizePx ?? 10) * 0.5);

  // Spacing -> step (px)
  const uiSpacing =
    opt.engine.strokePath?.spacing ?? (ov.spacing as number | undefined) ?? 6;
  const spacingFrac = resolveSpacingFraction(uiSpacing, 6);
  const stepPx = Math.max(0.4, Math.min(3.0, baseRadius * spacingFrac));

  // Resample to even steps (x,y,t,p)
  const samplesRaw: StrokeSample[] = resamplePath(path, stepPx);
  if (samplesRaw.length < 2) return;
  const samples: Sample[] = samplesRaw.map((s) => ({
    x: s.x,
    y: s.y,
    t: s.t,
    p: s.p,
  }));

  // Uniform “marker” look: push scale→flat by using a high uniformity
  const tipScaleStart =
    typeof ov.tipScaleStart === "number" ? ov.tipScaleStart : 0.85;
  const tipScaleEnd =
    typeof ov.tipScaleEnd === "number" ? ov.tipScaleEnd : 0.85;
  const tipMinPx =
    typeof ov.tipMinPx === "number" ? Math.max(0, ov.tipMinPx) : 0;
  const endBias = typeof ov.endBias === "number" ? ov.endBias : 0;
  const uniformity = 0.9; // marker signature

  const radiusAt = (u: number): number => {
    const i = Math.max(
      0,
      Math.min(samples.length - 1, Math.floor(u * (samples.length - 1)))
    );
    const s = samples[i]!;
    const p = clamp01(s.p);

    // Marker: slightly thicker, more constant
    const baseWidth = baseRadius * 2 * (0.8 + 0.5 * Math.pow(p, 0.75));
    const scale = computeWidthScale(u, {
      baseSizePx: baseRadius * 2,
      spacingPercent: 6,
      tipScaleStart,
      tipScaleEnd,
      endBias,
      uniformity,
    });

    const widthPx = Math.max(0, baseWidth * scale);
    return Math.max(tipMinPx * 0.5, widthPx * 0.5);
  };

  // Build outline and fill on an offscreen layer
  const outline = buildRibbonOutline(samples, radiusAt);
  const layer = createLayer(viewW, viewH);
  const lx = get2D(layer);

  lx.save();
  lx.clip(outline);

  // Solid marker fill (source-over) with flow
  lx.globalCompositeOperation = "source-over";
  lx.globalAlpha = flow01;
  (lx as CanvasRenderingContext2D).fillStyle = color;
  lx.fillRect(0, 0, viewW, viewH);

  // Optional marker tip fade (very subtle)
  applyTipFade(
    lx,
    samples[0]!,
    samples[samples.length - 1]!,
    0.08,
    viewW,
    viewH
  );

  lx.restore();

  // Final composite respects engine opacity
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = opacity01;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}
