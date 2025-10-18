// FILE: src/lib/brush/backends/stamping/variants/ink.ts
// Inking — crisp body, no paper tooth, optional micro anti-halo carve
// Strict TS-safe, no `any`, compatible with exactOptionalPropertyTypes.

import type {
  RenderOptions,
  RenderOverrides,
  CurvePoint,
} from "@/lib/brush/engine.types";
import type { BrushInputConfig } from "@/data/brushPresets";
import * as CanvasUtil from "@backends/utils/canvas";
import * as Blend from "@backends/utils/blending";
import type { Ctx2D } from "@backends/utils/canvas";

import {
  toPressureMapFromInput,
  toInputQualityFromInput,
} from "../core/inputMap";
import { forEachTrack } from "../core/tracks";
import {
  pathToStamps,
  type TaperProfile,
  type InputQualityOpts,
} from "@backends/utils/stroke";
import { evaluateCurve, DefaultCurves } from "@/lib/brush/curves";

/* ----------------------------- local helpers ----------------------------- */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const num = (v: unknown, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;
const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

/** Blend taper at the ends; same shaping as graphite’s version. */
function tipBlend(tNorm: number, startAmt: number, endAmt: number): number {
  const d = Math.min(tNorm, 1 - tNorm);
  const a = clamp01(d / 0.42);
  const soft = a < 1 ? Math.pow(a, 2.7) : 1;
  const towardStart = 1 - Math.min(1, tNorm * 2);
  const towardEnd = 1 - Math.min(1, (1 - tNorm) * 2);
  const amt = startAmt * towardStart + endAmt * towardEnd;
  return 1 - amt + amt * soft;
}
/** Bias width toward/away from the tail. */
function applyEndBias(width: number, tNorm: number, bias: number): number {
  const k = (tNorm - 0.5) * 2; // -1..+1
  return width * (1 + 0.28 * clamp(bias, -1, 1) * k);
}
/** Push toward a flatter “marker” body. */
function applyUniformity(
  width: number,
  belly01: number,
  uniformity: number
): number {
  const u = clamp01(uniformity);
  const dev = 0.31 * Math.pow(belly01, 0.75);
  const factor = dev > 0 ? (dev * (1 - u)) / dev : 1;
  return width * factor;
}

/* --------------------------------- types --------------------------------- */

type ExtRenderOptions = RenderOptions & { input?: BrushInputConfig };
type SamplePoint = { x: number; y: number; t: number; p: number };
type Gate = {
  tMid: number;
  bellyProgress: number;
  alphaProgress: number;
  midPressure: number; // 0..1
};

/* --------------------------------- main ---------------------------------- */

export default function drawInk(ctx: Ctx2D, options: ExtRenderOptions): void {
  const pts = options.path ?? [];
  if (pts.length < 2) return;

  const overrides = (options.engine.overrides ??
    {}) as Partial<RenderOverrides>;

  // ---------- Global composite & alpha ----------
  const composite: GlobalCompositeOperation =
    (overrides as { composite?: GlobalCompositeOperation }).composite ??
    options.engine.rendering?.blendMode ??
    "source-over";

  const baseOpacity01 = clamp01(num(overrides.opacity, 100) / 100);
  const flow01 = clamp01(num(overrides.flow, 100) / 100); // ink defaults to full flow

  // ---------- Base size (diameter px) ----------
  const baseSizePx = Math.max(
    0.5,
    num(options.baseSizePx, 8) * num(options.engine.shape?.sizeScale, 1)
  );

  // ---------- Input mapping ----------
  const pmap = toPressureMapFromInput(options.input);
  const iq: InputQualityOpts = toInputQualityFromInput(options.input);

  // ---------- Stroke path params ----------
  const spacingPercent =
    options.engine.strokePath?.spacing ?? num(overrides.spacing, 7);

  const jitterPercent =
    num(options.engine.strokePath?.jitter, num(overrides.jitter, 0)) * 100;

  const scatterPx = num(
    options.engine.strokePath?.scatter,
    num(overrides.scatter, 0)
  );

  const stampsPerStep = num(
    options.engine.strokePath?.count,
    num(overrides.count, 1)
  );

  const streamline = num(options.engine.strokePath?.streamline, 0.1);

  const tipScaleStart = num(overrides.tipScaleStart, 0.9);
  const tipScaleEnd = num(overrides.tipScaleEnd, 0.9);

  const taperProfileStart = (overrides.taperProfileStart ??
    "linear") as TaperProfile;
  const taperProfileEnd = (overrides.taperProfileEnd ??
    "linear") as TaperProfile;

  // ---------- Build stamps ----------
  const stamps = pathToStamps(pts, {
    baseSizePx,
    spacingPercent: Number(spacingPercent),
    jitterPercent: Number(jitterPercent),
    scatterPx: Number(scatterPx),
    stampsPerStep: Number(stampsPerStep),
    streamline: Number(streamline),
    angleFollowDirection: num(overrides.angleFollowDirection, 1),
    angleJitterDeg: num(overrides.angleJitter, 0),
    tipMinPx: num(overrides.tipMinPx, 0),
    tipScaleStart,
    tipScaleEnd,
    taperProfileStart,
    taperProfileEnd,
    endBias: num(overrides.endBias, 0),
    uniformity: num(overrides.uniformity, 0.5),
    pressureMap: pmap,
    inputQuality: iq,
  });

  const samples: SamplePoint[] = stamps.map((s) => ({
    x: s.x,
    y: s.y,
    t: s.t, // normalized [0..1] from stroke util
    p: s.pressure, // 0..1
  }));
  if (samples.length < 2) return;

  // ---------- Gates (mid-segment control points) ----------
  const gates: Gate[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const tMid = (a.t + b.t) * 0.5;
    const d = Math.min(tMid, 1 - tMid);
    const frac = Math.max(0, Math.min(1, d / 0.42)); // same edge window as graphite
    gates.push({
      tMid,
      bellyProgress: frac,
      alphaProgress: frac < 1 ? Math.pow(frac, 2.7) : 1,
      midPressure: (a.p + b.p) * 0.5,
    });
  }
  if (gates.length === 0) return;

  // ---------- Shaping controls ----------
  const tipMinPx = Math.max(0, num(overrides.tipMinPx, 0));
  const endBias = clamp(num(overrides.endBias, 0), -1, 1);
  const uniformity = clamp01(num(overrides.uniformity, 0.6)); // flatter vs graphite

  // Split nibs
  const splitCount = Math.max(
    1,
    Math.round(
      num(options.engine.strokePath?.count, num(overrides.splitCount, 1))
    )
  );
  const splitSpacing = num(overrides.splitSpacing, 0);
  const splitSpacingJitter = clamp01(
    num(overrides.splitSpacingJitter, 0) / 100
  );
  const splitCurvature = clamp(num(overrides.splitCurvature, 0), -1, 1);
  const splitAsymmetry = clamp(num(overrides.splitAsymmetry, 0), -1, 1);
  const splitScatter = Math.max(0, num(overrides.splitScatter, 0));
  const splitAngle = num(overrides.splitAngle, 0) * (Math.PI / 180);
  const pressureToSplitSpacing = clamp01(
    num(overrides.pressureToSplitSpacing, 0)
  );

  // ---------- Curve hooks (pressure/speed/width) ----------
  const pressureToWidthCurve =
    (overrides as { pressureToWidthCurve?: ReadonlyArray<CurvePoint> })
      .pressureToWidthCurve ??
    ([
      { x: 0, y: 0.25 },
      { x: 1, y: 1 },
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

  // =====================================================================
  // A) Build alpha mask (single crisp pass)
  // =====================================================================
  const mask = CanvasUtil.createLayer(options.width, options.height);
  const mx = mask.getContext("2d", { alpha: true }) as Ctx2D;
  mx.strokeStyle = "#000";
  mx.lineCap = "round";
  mx.lineJoin = "round";
  (mx as CanvasRenderingContext2D).globalCompositeOperation = "source-over";

  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const { bellyProgress, alphaProgress, midPressure, tMid } = gates[i - 1]!;
    if (alphaProgress <= 0.001) continue;

    // Width shaping — use pressureToWidthCurve
    const pressureWidthMul = evaluateCurve(
      pressureToWidthCurve,
      clamp01(midPressure)
    );

    let widthPx =
      baseSizePx *
      pressureWidthMul *
      (0.42 * Math.pow(bellyProgress, 0.8) + 0.12);

    widthPx *= tipBlend(tMid, tipScaleStart, tipScaleEnd);
    widthPx = applyEndBias(widthPx, tMid, endBias);
    widthPx = applyUniformity(widthPx, bellyProgress, uniformity);
    if (tipMinPx > 0) widthPx = Math.max(widthPx, tipMinPx);

    mx.lineWidth = Math.max(0.5, widthPx);

    // Segment speed (approx; stamps have normalized t, not milliseconds)
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distPx = Math.hypot(dx, dy);
    // Assume ~16ms step as we don't have absolute timestamps here
    const speedPxPerSec = distPx / (16 / 1000);

    const pf = evaluateCurve(pressureToFlowCurve, clamp01(midPressure));
    const sf = evaluateCurve(
      speedToFlowCurve,
      clamp01(speedPxPerSec / Math.max(1, speedNormRefPxPerSec))
    );

    // Alpha for this segment
    mx.globalAlpha = clamp01(baseOpacity01 * flow01 * pf * sf * alphaProgress);

    forEachTrack(
      0xdeadbeef, // deterministic seed for ink offsets
      splitCount,
      splitSpacing,
      splitSpacingJitter,
      pressureToSplitSpacing,
      splitCurvature,
      splitAsymmetry,
      splitScatter,
      splitAngle,
      tMid,
      midPressure,
      a.x,
      a.y,
      b.x,
      b.y,
      (ax: number, ay: number, bx: number, by: number) => {
        mx.beginPath();
        mx.moveTo(ax, ay);
        mx.lineTo(bx, by);
        mx.stroke();
      }
    );
  }

  // =====================================================================
  // B) Paint fill → clip by mask
  // =====================================================================
  const paint = CanvasUtil.createLayer(options.width, options.height);
  const px = paint.getContext("2d", { alpha: true }) as Ctx2D;
  px.fillStyle = options.color ?? "#000000";
  px.fillRect(0, 0, options.width, options.height);
  Blend.withComposite(px, "destination-in", () => {
    px.drawImage(mask, 0, 0);
  });

  // Optional micro anti-halo carve (ink razor edge)
  const carveAlpha = clamp01(num(overrides.edgeCarveAlpha, 0.06));
  if (carveAlpha > 0.001) {
    const blurred = CanvasUtil.createLayer(options.width, options.height);
    const bx = blurred.getContext("2d", { alpha: true }) as Ctx2D;
    bx.filter = "blur(0.25px)";
    bx.drawImage(paint, 0, 0);
    bx.filter = "none";
    Blend.withCompositeAndAlpha(px, "destination-out", carveAlpha, () => {
      px.drawImage(blurred, 0, 0);
    });
  }

  // =====================================================================
  // C) Composite to destination (respect composite/blend)
  // =====================================================================
  Blend.withComposite(ctx, composite, () => {
    ctx.drawImage(paint, 0, 0);
  });
}

export const drawStampInk = drawInk;
