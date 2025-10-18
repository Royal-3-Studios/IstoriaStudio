// FILE: src/lib/brush/backends/stamping/variants/ornament.ts
import type {
  RenderOptions,
  CurvePoint,
  RenderOverrides,
} from "@/lib/brush/engine.types";
import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer, get2D } from "@backends/utils/canvas";
import { clamp01 } from "@backends/utils/color";
import { trackOffsets } from "../core/tracks";
import {
  resampleWithAngle,
  spacingToStepPx,
  type SamplePoint,
} from "../core/resample";
import { evaluateCurve, DefaultCurves } from "@/lib/brush/curves";

function drawStampOrnamentImpl(ctx: Ctx2D, opt: RenderOptions): void {
  const points = opt.path ?? [];
  if (points.length < 2) return;

  const overrides = (opt.engine.overrides ?? {}) as Partial<RenderOverrides>;
  const color = opt.color ?? "#000000";

  // ---- Composite & global opacity ------------------------------------------
  const composite: GlobalCompositeOperation =
    (overrides as { composite?: GlobalCompositeOperation }).composite ??
    opt.engine.rendering?.blendMode ??
    "source-over";

  const flow01 = clamp01(
    ((overrides.opacity as number | undefined) ?? 100) / 100
  ); // fallback: use opacity as overall stroke strength
  const opacity01 = clamp01(
    ((overrides.opacity as number | undefined) ?? 100) / 100
  );

  // ---- Geometry & sampling --------------------------------------------------
  const baseDiameterPx = Math.max(1, opt.baseSizePx ?? 12);
  const baseRadius = baseDiameterPx * 0.5;

  const stepPx = spacingToStepPx(opt, baseRadius);
  const samples: SamplePoint[] = resampleWithAngle(points, stepPx);
  if (samples.length < 2) return;

  // Simple symmetric “fan” of round ornaments around the path midpoints
  const fan = {
    count: 3,
    spreadPx: Math.max(3, baseRadius * 0.9),
    curvature: 0.12,
    asymmetry: 0,
  } as const;

  // ---- Curves (with safe defaults) ------------------------------------------
  const pressureToWidthCurve =
    (overrides as { pressureToWidthCurve?: ReadonlyArray<CurvePoint> })
      .pressureToWidthCurve ??
    ([
      { x: 0, y: 0.7 },
      { x: 1, y: 1.1 },
    ] as ReadonlyArray<CurvePoint>);

  const pressureToFlowCurve =
    (overrides as { pressureToFlowCurve?: ReadonlyArray<CurvePoint> })
      .pressureToFlowCurve ??
    ([
      { x: 0, y: 0.35 },
      { x: 1, y: 1.0 },
    ] as ReadonlyArray<CurvePoint>);

  const speedToFlowCurve =
    (overrides as { speedToFlowCurve?: ReadonlyArray<CurvePoint> })
      .speedToFlowCurve ?? DefaultCurves.easeInOut;

  const speedNormRefPxPerSec =
    (overrides as { speedNormRefPxPerSec?: number }).speedNormRefPxPerSec ??
    1000;

  // ---- Draw to an offscreen layer, then composite ---------------------------
  const viewW = Math.max(1, Math.floor(opt.width));
  const viewH = Math.max(1, Math.floor(opt.height));
  const layer = createLayer(viewW, viewH);
  const lctx = get2D(layer) as CanvasRenderingContext2D;
  lctx.save();
  lctx.globalCompositeOperation = "source-over";
  lctx.fillStyle = color;
  lctx.globalAlpha = 1;

  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const tMid = 0.5 * (a.t + b.t);

    // Segment direction & normal
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);

    // Pressure & speed for this segment
    const p = clamp01(b.p ?? a.p ?? 1);

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distPx = Math.hypot(dx, dy);
    const dtMs =
      typeof a.t === "number" && typeof b.t === "number"
        ? Math.max(1, b.t - a.t)
        : 16; // ~60 FPS fallback
    const speedPxPerSec = distPx / (dtMs / 1000);
    const speedNorm = clamp01(
      speedPxPerSec / Math.max(1, speedNormRefPxPerSec)
    );

    // Curves → width & per-dot alpha
    const widthMul = evaluateCurve(pressureToWidthCurve, p);
    const pf = evaluateCurve(pressureToFlowCurve, p);
    const sf = evaluateCurve(speedToFlowCurve, speedNorm);
    const dotAlpha = clamp01(flow01 * pf * sf);
    if (dotAlpha <= 0.001) continue;

    // Fan offsets for this t (symmetric about the centerline)
    const offsets = trackOffsets(tMid, fan);

    // Base dot radius (scaled with pressure curve a bit)
    const dotRadius = Math.max(1, baseRadius * 0.45 * widthMul);

    // Midpoint of the segment
    const mx = 0.5 * (a.x + b.x);
    const my = 0.5 * (a.y + b.y);

    // Draw the set of dots for this segment
    for (const d of offsets) {
      const cx = mx + nx * d;
      const cy = my + ny * d;

      lctx.globalAlpha = dotAlpha;
      lctx.beginPath();
      lctx.arc(cx, cy, dotRadius, 0, Math.PI * 2, false);
      lctx.fill();
    }
  }

  lctx.restore();

  // Final composite to destination with blend + overall opacity
  const prevComposite = ctx.globalCompositeOperation;
  (ctx as CanvasRenderingContext2D).globalCompositeOperation = composite;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalAlpha = opacity01;
  ctx.drawImage(layer, 0, 0);
  ctx.globalAlpha = prevAlpha;
  (ctx as CanvasRenderingContext2D).globalCompositeOperation = prevComposite;
}

export default drawStampOrnamentImpl;
export const drawStampOrnament = drawStampOrnamentImpl;
