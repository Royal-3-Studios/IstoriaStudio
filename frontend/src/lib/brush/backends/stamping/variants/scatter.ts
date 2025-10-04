// FILE: src/lib/brush/backends/stamping/variants/scatter.ts
import type { RenderOptions } from "@/lib/brush/engine";
import type { Ctx2D } from "../utils/canvas";
import { createLayer, get2D } from "../utils/canvas";
import { pathToStamps } from "@/lib/brush/backends/utils/stroke";
import { clamp01 } from "../utils/color";

export function drawStampScatter(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  if (pts.length < 2) return;

  const color = opt.color ?? "#000000";
  const viewW = Math.max(1, Math.floor(opt.width));
  const viewH = Math.max(1, Math.floor(opt.height));

  const flow01 = clamp01(
    ((opt.engine.overrides?.flow as number | undefined) ?? 100) / 100
  );
  const opacity01 = clamp01(
    ((opt.engine.overrides?.opacity as number | undefined) ?? 100) / 100
  );

  const baseSizePx = opt.baseSizePx ?? 10;
  const spacingPercent =
    opt.engine.strokePath?.spacing ??
    (opt.engine.overrides?.spacing as number | undefined) ??
    8;
  const jitterPercent =
    ((opt.engine.strokePath?.jitter ??
      (opt.engine.overrides?.jitter as number | undefined) ??
      2) as number) * 100;
  const scatterPx =
    opt.engine.strokePath?.scatter ??
    (opt.engine.overrides?.scatter as number | undefined) ??
    4;

  const stamps = pathToStamps(pts, {
    baseSizePx,
    spacingPercent,
    jitterPercent,
    scatterPx,
    stampsPerStep: 1,
    streamline: opt.engine.strokePath?.streamline ?? 0,
    angleFollowDirection: 0,
    angleJitterDeg: 0,
    tipMinPx: 0,
    tipScaleStart: 0.95,
    tipScaleEnd: 0.95,
    taperProfileStart: "linear",
    taperProfileEnd: "linear",
    endBias: 0,
    uniformity: 0,
  });
  if (!stamps.length) return;

  const layer = createLayer(viewW, viewH);
  const lx = get2D(layer);
  lx.save();
  lx.globalAlpha = flow01;
  (lx as CanvasRenderingContext2D).fillStyle = color;

  for (const s of stamps) {
    const r = Math.max(2, 0.5 * baseSizePx * (0.6 + 0.6 * s.pressure));
    lx.beginPath();
    lx.arc(s.x, s.y, r, 0, Math.PI * 2, false);
    lx.fill();
  }
  lx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = opacity01;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}
