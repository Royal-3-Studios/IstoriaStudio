// FILE: src/lib/brush/backends/stamping/variants/scatter.ts
import type { RenderOptions, CurvePoint } from "@/lib/brush/engine.types";
import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer, get2D } from "@backends/utils/canvas";
import { pathToStamps } from "@backends/utils/stroke";
import { clamp01 } from "@backends/utils/color";
import { evaluateCurve, DefaultCurves } from "@/lib/brush/curves";

/**
 * Scatter: quick “speckled” stamps along the path.
 * - Uses pathToStamps (pressure preserved, t is 0..1 path fraction — NOT time).
 * - Alpha comes from pressure/speed curves; speed is a rough distance-based proxy.
 */
function drawScatter(ctx: Ctx2D, opt: RenderOptions): void {
  const points = opt.path ?? [];
  if (points.length < 2) return;

  const overrides = opt.engine.overrides ?? {};
  const color = opt.color ?? "#000000";

  // ---- Composite (overrides.composite → rendering.blendMode → default) ----
  const composite: GlobalCompositeOperation =
    (overrides as { composite?: GlobalCompositeOperation }).composite ??
    opt.engine.rendering?.blendMode ??
    "source-over";

  // ---- Global flow/opacity ---------------------------------------------------
  const flow01 = clamp01(((overrides.flow as number | undefined) ?? 100) / 100);
  const opacity01 = clamp01(
    ((overrides.opacity as number | undefined) ?? 100) / 100
  );

  const viewW = Math.max(1, Math.floor(opt.width));
  const viewH = Math.max(1, Math.floor(opt.height));

  // ---- Stroke path params ----------------------------------------------------
  const baseSizePx = Math.max(1, opt.baseSizePx ?? 10);

  const spacingPercent =
    opt.engine.strokePath?.spacing ??
    (overrides.spacing as number | undefined) ??
    8;

  const jitterPercent =
    ((opt.engine.strokePath?.jitter ??
      (overrides.jitter as number | undefined) ??
      2) as number) * 100;

  const scatterPx =
    opt.engine.strokePath?.scatter ??
    (overrides.scatter as number | undefined) ??
    4;

  const streamline = (opt.engine.strokePath?.streamline ?? 0) as number;

  // ---- Build scattered stamps (pathToStamps gives x,y,pressure,t) -----------
  const stamps = pathToStamps(points, {
    baseSizePx,
    spacingPercent,
    jitterPercent,
    scatterPx,
    stampsPerStep: 1,
    streamline,
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

  // ---- Curves (optional; defaults mimic your previous feel) ------------------
  const pressureToWidthCurve =
    (overrides as { pressureToWidthCurve?: ReadonlyArray<CurvePoint> })
      .pressureToWidthCurve ??
    ([
      { x: 0, y: 0.6 }, // slightly thinner at low pressure
      { x: 1, y: 1.1 }, // a touch wider at high pressure
    ] as ReadonlyArray<CurvePoint>);

  const pressureToFlowCurve =
    (overrides as { pressureToFlowCurve?: ReadonlyArray<CurvePoint> })
      .pressureToFlowCurve ??
    ([
      { x: 0, y: 0.35 },
      { x: 1, y: 1 },
    ] as ReadonlyArray<CurvePoint>);

  const speedToFlowCurve =
    (overrides as { speedToFlowCurve?: ReadonlyArray<CurvePoint> })
      .speedToFlowCurve ?? DefaultCurves.easeInOut;

  const speedNormRefPxPerSec =
    (overrides as { speedNormRefPxPerSec?: number }).speedNormRefPxPerSec ??
    1000;

  // ---- Render to a temp layer ------------------------------------------------
  const layer = createLayer(viewW, viewH);
  const lctx = get2D(layer);

  // Use source-over inside the layer; apply blend at the final composite.
  (lctx as CanvasRenderingContext2D).globalCompositeOperation = "source-over";
  (lctx as CanvasRenderingContext2D).fillStyle = color;

  lctx.save();
  lctx.globalAlpha = 1;

  // Draw each scattered stamp as a filled circle (fast path)
  for (let i = 0; i < stamps.length; i++) {
    const s = stamps[i]!;
    const prev = stamps[i - 1] ?? s;

    // Pressure (0..1)
    const p = clamp01(s.pressure);

    // Approx speed from distance only (do NOT use stamp.t; it's a path fraction)
    const dx = s.x - prev.x;
    const dy = s.y - prev.y;
    const distPx = Math.hypot(dx, dy);

    // Assume ~16ms frame step when estimating speed (coarse but stable).
    const speedPxPerSec = distPx / (16 / 1000);
    const speedNorm = clamp01(
      speedPxPerSec / Math.max(1, speedNormRefPxPerSec)
    );

    // Width via curve
    const widthMul = evaluateCurve(pressureToWidthCurve, p);
    const radius = Math.max(1, 0.5 * baseSizePx * widthMul);

    // Alpha via curves * global flow
    const pf = evaluateCurve(pressureToFlowCurve, p);
    const sf = evaluateCurve(speedToFlowCurve, speedNorm);
    const alpha = clamp01(flow01 * pf * sf);

    if (alpha <= 0.001) continue;

    lctx.globalAlpha = alpha;
    lctx.beginPath();
    lctx.arc(s.x, s.y, radius, 0, Math.PI * 2, false);
    lctx.fill();
  }
  lctx.restore();

  // ---- Composite layer to destination with overall opacity & blend ----------
  ctx.save();
  (ctx as CanvasRenderingContext2D).globalCompositeOperation = composite;
  ctx.globalAlpha = opacity01;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

export default drawScatter;
// Named export to satisfy `import { drawStampScatter } from "./variants/scatter"`
export const drawStampScatter = drawScatter;
