// FILE: src/lib/brush/backends/stamping/variants/marker.ts
import type { CurvePoint, RenderOptions } from "@/lib/brush/engine.types";
import type { Ctx2D } from "@backends/utils/canvas";
import {
  spacingToStepPx,
  resampleWithAngle,
  type SamplePoint,
} from "../core/resample";
import { widthPxFromScale, type WidthOpts } from "../core/width";
import { evaluateCurve, DefaultCurves } from "@/lib/brush/curves";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Default export so stamping/index.ts can import drawMarker as default. */
export default function drawMarker(ctx: Ctx2D, opt: RenderOptions): void {
  const path = opt.path ?? [];
  if (!path.length) return;

  const ov = opt.engine.overrides ?? {};
  const baseSizePx = opt.baseSizePx ?? 8;
  const baseRadiusPx = Math.max(0.25, baseSizePx * 0.5);

  // Resample along the path at spacing determined from UI → pixels
  const stepPx = spacingToStepPx(opt, baseRadiusPx);
  const samples: SamplePoint[] = resampleWithAngle(path, stepPx);
  if (samples.length === 0) return;

  // Flow (0..1) and composite
  const flowBase = clamp01(
    ((opt.engine.rendering?.flow as number | undefined) ?? 100) / 100
  );
  const prevComposite = ctx.globalCompositeOperation;
  const blend = opt.engine.rendering?.blendMode;
  if (blend) ctx.globalCompositeOperation = blend;

  // Color
  (ctx as CanvasRenderingContext2D).fillStyle = opt.color ?? "#000";

  // Curve: pressure → flow multiplier (fallback to a gentle ease)
  const pressureToFlowCurve: ReadonlyArray<CurvePoint> =
    (ov as { pressureToFlowCurve?: ReadonlyArray<CurvePoint> })
      .pressureToFlowCurve ?? DefaultCurves.easeInOut;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const p = clamp01(s.p);

    // Build width options WITHOUT undefineds (exactOptionalPropertyTypes-friendly)
    const widthOpts: WidthOpts = {
      baseSizePx,
      ...(typeof (ov as any).tipMinPx === "number"
        ? { tipMinPx: (ov as any).tipMinPx as number }
        : {}),
      ...(typeof ov.uniformity === "number"
        ? { uniformity: ov.uniformity as number }
        : {}),
      ...(typeof ov.endBias === "number"
        ? { endBias: ov.endBias as number }
        : {}),
      ...(typeof ov.tipScaleStart === "number"
        ? { tipScaleStart: ov.tipScaleStart as number }
        : {}),
      ...(typeof ov.tipScaleEnd === "number"
        ? { tipScaleEnd: ov.tipScaleEnd as number }
        : {}),
      ...(typeof ov.taperProfileStart === "string"
        ? { taperProfileStart: ov.taperProfileStart as any }
        : {}),
      ...(typeof ov.taperProfileEnd === "string"
        ? { taperProfileEnd: ov.taperProfileEnd as any }
        : {}),
      ...(Array.isArray((ov as any).pressureToWidthCurve)
        ? {
            pressureToWidthCurve: (ov as any)
              .pressureToWidthCurve as ReadonlyArray<CurvePoint>,
          }
        : {}),
    };

    // Width in px from normalized progress & pressure
    const wPx = widthPxFromScale(baseRadiusPx, s.t, p, widthOpts);
    const r = Math.max(0.25, wPx * 0.5);

    // Flow modulation by pressure curve
    const flowMul = evaluateCurve(pressureToFlowCurve, p);
    const alpha = clamp01(flowBase * flowMul);
    if (alpha <= 0) continue;

    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // restore
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = prevComposite;
}
