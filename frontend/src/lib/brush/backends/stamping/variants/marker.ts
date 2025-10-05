// FILE: src/lib/brush/backends/stamping/variants/marker.ts
import type { RenderOptions } from "@/lib/brush/engine";
import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer, get2D } from "@backends/utils/canvas";
import {
  spacingToStepPx,
  resampleWithAngle,
  type SamplePoint,
} from "../core/resample";
import { buildRibbonOutline } from "../core/outline";
import { widthPxFromScale } from "../core/width";
import { clamp01 } from "../utils/color";

export function drawStampMarker(ctx: Ctx2D, opt: RenderOptions): void {
  const path = opt.path ?? [];
  if (path.length < 2) return;

  const color = opt.color ?? "#000000";
  const flow01 = clamp01(
    ((opt.engine.overrides?.flow as number | undefined) ?? 100) / 100
  );
  const opacity01 = clamp01(
    ((opt.engine.overrides?.opacity as number | undefined) ?? 100) / 100
  );

  const viewW = Math.max(1, Math.floor(opt.width));
  const viewH = Math.max(1, Math.floor(opt.height));

  const baseR = Math.max(0.5, (opt.baseSizePx ?? 10) * 0.5);
  const stepPx = spacingToStepPx(opt, baseR);
  const samples: SamplePoint[] = resampleWithAngle(path, stepPx);
  if (samples.length < 2) return;

  const tipMinPx = (opt.engine.overrides?.tipMinPx as number | undefined) ?? 0;

  const radiusAt = (t: number) =>
    0.5 *
    widthPxFromScale(
      baseR,
      t,
      samples[Math.floor(t * (samples.length - 1))]!.p,
      {
        baseSizePx: opt.baseSizePx ?? 10,
        uniformity: 0.8,
        tipScaleStart: 0.9,
        tipScaleEnd: 0.9,
      },
      tipMinPx
    );

  const outline = buildRibbonOutline(samples, radiusAt);

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
