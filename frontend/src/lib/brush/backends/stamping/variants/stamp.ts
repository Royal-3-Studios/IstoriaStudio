// FILE: src/lib/brush/backends/stamping/variants/stamp.ts
import type {
  RenderOptions,
  CurvePoint,
  RenderOverrides,
} from "@/lib/brush/engine.types";
import type { Ctx2D } from "@backends/utils/canvas";
import { clamp01 } from "@backends/utils/color";
import { evaluateCurve, DefaultCurves } from "@/lib/brush/curves";

/** Draw one stamp at the last path point (tilt-aware ellipse via transforms). */
function drawSingleStampImpl(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  const n = pts.length;
  if (n === 0) return;

  const curr = pts[n - 1]!;
  const prev = pts[n - 2] ?? curr;

  const ov = (opt.engine.overrides ?? {}) as Partial<RenderOverrides>;
  const color = opt.color ?? "#000000";

  // ---- composite (overrides.composite → rendering.blendMode → default) ----
  const composite: GlobalCompositeOperation =
    (ov as { composite?: GlobalCompositeOperation }).composite ??
    opt.engine.rendering?.blendMode ??
    "source-over";

  const prevComposite = ctx.globalCompositeOperation;
  (ctx as CanvasRenderingContext2D).globalCompositeOperation = composite;

  // ---- global flow ----------------------------------------------------------
  const flow01 = clamp01(((ov.flow as number | undefined) ?? 100) / 100);

  // ---- pressure & speed curves ---------------------------------------------
  const pRaw =
    typeof (curr as { p?: number }).p === "number"
      ? (curr as { p?: number }).p!
      : typeof curr.pressure === "number"
        ? curr.pressure!
        : 1;

  const p = clamp01(pRaw);

  // Speed proxy: use distance and assume ~16 ms between stamps (don’t use t)
  const dx = curr.x - prev.x;
  const dy = curr.y - prev.y;
  const distPx = Math.hypot(dx, dy);
  const speedPxPerSec = distPx / (16 / 1000); // ≈ frame-to-frame

  const speedRef =
    (ov as { speedNormRefPxPerSec?: number }).speedNormRefPxPerSec ?? 1000;
  const speedNorm = clamp01(speedPxPerSec / Math.max(1, speedRef));

  const pressureToWidthCurve =
    (ov as { pressureToWidthCurve?: ReadonlyArray<CurvePoint> })
      .pressureToWidthCurve ??
    ([
      { x: 0, y: 0.25 },
      { x: 1, y: 1.0 },
    ] as ReadonlyArray<CurvePoint>);

  const pressureToFlowCurve =
    (ov as { pressureToFlowCurve?: ReadonlyArray<CurvePoint> })
      .pressureToFlowCurve ??
    ([
      { x: 0, y: 0.35 },
      { x: 1, y: 1.0 },
    ] as ReadonlyArray<CurvePoint>);

  const speedToFlowCurve =
    (ov as { speedToFlowCurve?: ReadonlyArray<CurvePoint> }).speedToFlowCurve ??
    DefaultCurves.easeInOut;

  const widthMul = evaluateCurve(pressureToWidthCurve, p);
  const alphaMul = clamp01(
    flow01 *
      evaluateCurve(pressureToFlowCurve, p) *
      evaluateCurve(speedToFlowCurve, speedNorm)
  );

  if (alphaMul <= 0) {
    // Restore composite and bail early
    (ctx as CanvasRenderingContext2D).globalCompositeOperation = prevComposite;
    return;
  }

  // ---- base size + tilt routing --------------------------------------------
  const baseDiam = Math.max(1, opt.baseSizePx ?? 8);
  const baseR = 0.5 * baseDiam * widthMul;

  const tilt01 = clamp01((curr as { tilt?: number }).tilt ?? 0);
  const tiltToSize = clamp01((ov as { tiltToSize?: number }).tiltToSize ?? 0);
  const tiltToFan = clamp01((ov as { tiltToFan?: number }).tiltToFan ?? 0);

  const sizeMul = 1 + tiltToSize * tilt01;
  const fanMul = 1 + tiltToFan * tilt01;

  const major = Math.max(0.5, baseR * sizeMul * fanMul);
  const minor = Math.max(0.5, (baseR * sizeMul) / Math.max(0.0001, fanMul));

  // ---- angle ---------------------------------------------------------------
  const angle =
    typeof (curr as { angle?: number }).angle === "number"
      ? (curr as { angle?: number }).angle!
      : n >= 2
        ? Math.atan2(curr.y - prev.y, curr.x - prev.x)
        : 0;

  // ---- draw ----------------------------------------------------------------
  const dctx = ctx as CanvasRenderingContext2D;
  dctx.save();
  dctx.globalAlpha = alphaMul;
  dctx.fillStyle = color;

  dctx.translate(curr.x, curr.y);
  dctx.rotate(angle);
  dctx.scale(major / Math.max(0.5, baseR), minor / Math.max(0.5, baseR));

  dctx.beginPath();
  dctx.arc(0, 0, Math.max(0.5, baseR), 0, Math.PI * 2, false);
  dctx.fill();

  dctx.restore();

  // Restore composite
  (ctx as CanvasRenderingContext2D).globalCompositeOperation = prevComposite;
}

export default drawSingleStampImpl;
// Named export so `index.ts` can `import { drawSingleStamp } from "./variants/stamp"`
export const drawSingleStamp = drawSingleStampImpl;
