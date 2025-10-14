// FILE: src/lib/brush/backends/stamping/variants/ink.ts
// Inking — crisp body, no paper tooth, optional micro anti-halo carve
// Strict TS-safe, no `any`, compatible with exactOptionalPropertyTypes.

import type { RenderOptions, RenderOverrides } from "@/lib/brush/engine.types";
import type { BrushInputConfig } from "@/data/brushPresets";
import * as CanvasUtil from "@backends/utils/canvas";
import * as Blend from "@backends/utils/blending";

import type { Ctx2D } from "@backends/utils/canvas";
import {
  clamp01,
  tipBlend,
  applyEndBias,
  applyUniformity,
  pressureToFlowScale,
  pressureToWidthScale,
} from "../utils";
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

type ExtRenderOptions = RenderOptions & { input?: BrushInputConfig };
type SamplePoint = { x: number; y: number; t: number; p: number };
type Gate = {
  tMid: number;
  bellyProgress: number;
  alphaProgress: number;
  midPressure: number;
};

export function drawInk(ctx: Ctx2D, options: ExtRenderOptions): void {
  const pts = options.path ?? [];
  if (pts.length < 2) return;

  const overrides = (options.engine.overrides ??
    {}) as Partial<RenderOverrides>;

  const baseOpacity01 = clamp01(((overrides.opacity ?? 100) as number) / 100);
  const baseFlow01 = clamp01(((overrides.flow ?? 100) as number) / 100); // ink defaults to full flow

  // Base size (diameter in px), respecting optional shape scale
  const rawSize =
    typeof options.baseSizePx === "number" &&
    Number.isFinite(options.baseSizePx)
      ? options.baseSizePx
      : 8;
  const sizeScale =
    typeof options.engine.shape?.sizeScale === "number" &&
    Number.isFinite(options.engine.shape.sizeScale)
      ? options.engine.shape.sizeScale
      : 1;
  const baseSizePx = Math.max(0.5, rawSize * sizeScale);

  // Input mapping (never undefined in our code-path)
  const pmap = toPressureMapFromInput(options.input);
  const iq: InputQualityOpts = toInputQualityFromInput(options.input);

  // Tighter defaults for ink
  const spacingPercent =
    options.engine.strokePath?.spacing ??
    (overrides.spacing as number | undefined) ??
    7;

  const jitterPercent =
    ((options.engine.strokePath?.jitter ?? overrides.jitter ?? 0) as number) *
    100;

  const scatterPx = (options.engine.strokePath?.scatter ??
    overrides.scatter ??
    0) as number;

  const stampsPerStep = (options.engine.strokePath?.count ??
    overrides.count ??
    1) as number;

  const streamline = (options.engine.strokePath?.streamline ?? 0.1) as number;

  const tipScaleStart = (overrides.tipScaleStart ?? 0.9) as number;
  const tipScaleEnd = (overrides.tipScaleEnd ?? 0.9) as number;

  const taperProfileStart = (overrides.taperProfileStart ??
    "linear") as TaperProfile;
  const taperProfileEnd = (overrides.taperProfileEnd ??
    "linear") as TaperProfile;

  const stamps = pathToStamps(pts, {
    baseSizePx,
    spacingPercent: Number(spacingPercent),
    jitterPercent: Number(jitterPercent),
    scatterPx: Number(scatterPx),
    stampsPerStep: Number(stampsPerStep),
    streamline: Number(streamline),
    angleFollowDirection: (overrides.angleFollowDirection ?? 1) as number,
    angleJitterDeg: (overrides.angleJitter ?? 0) as number,
    tipMinPx: (overrides.tipMinPx ?? 0) as number,
    tipScaleStart,
    tipScaleEnd,
    taperProfileStart,
    taperProfileEnd,
    endBias: (overrides.endBias ?? 0) as number,
    uniformity: (overrides.uniformity ?? 0.5) as number, // a touch flatter for ink
    // rng: omit → stroke.ts uses Math.random()
    pressureMap: pmap,
    inputQuality: iq,
  });

  const samples: SamplePoint[] = stamps.map((s) => ({
    x: s.x,
    y: s.y,
    t: s.t,
    p: s.pressure,
  }));
  if (samples.length < 2) return;

  // Build mid-segment “gates” for shaping & alpha
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

  // Body shaping choices for ink
  const tipMinPx = Math.max(0, (overrides.tipMinPx ?? 0) as number);
  const endBias = Math.max(-1, Math.min(1, (overrides.endBias ?? 0) as number));
  const uniformity = clamp01((overrides.uniformity ?? 0.6) as number); // flatter vs graphite

  // Split nibs (ink can still use multi-track)
  const splitCount = Math.max(
    1,
    Math.round(
      (options.engine.strokePath?.count ?? overrides.splitCount ?? 1) as number
    )
  );
  const splitSpacing = (overrides.splitSpacing ?? 0) as number;
  const splitSpacingJitter = clamp01(
    ((overrides.splitSpacingJitter ?? 0) as number) / 100
  );
  const splitCurvature = Math.max(
    -1,
    Math.min(1, (overrides.splitCurvature ?? 0) as number)
  );
  const splitAsymmetry = Math.max(
    -1,
    Math.min(1, (overrides.splitAsymmetry ?? 0) as number)
  );
  const splitScatter = Math.max(0, (overrides.splitScatter ?? 0) as number);
  const splitAngle = ((overrides.splitAngle ?? 0) as number) * (Math.PI / 180);
  const pressureToSplitSpacing = clamp01(
    (overrides.pressureToSplitSpacing ?? 0) as number
  );

  /* A) Build alpha mask (single crisp pass) */
  const mask = CanvasUtil.createLayer(options.width, options.height);
  const mx = mask.getContext("2d", { alpha: true }) as Ctx2D;
  mx.strokeStyle = "#000";
  mx.lineCap = "round";
  mx.lineJoin = "round";

  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const { bellyProgress, alphaProgress, midPressure, tMid } = gates[i - 1]!;
    if (alphaProgress <= 0.001) continue;

    // Ink body: crisper/flatter than graphite
    let widthPx =
      baseSizePx *
      pressureToWidthScale(midPressure) *
      (0.42 * Math.pow(bellyProgress, 0.8) + 0.12);

    widthPx *= tipBlend(tMid, tipScaleStart, tipScaleEnd);
    widthPx = applyEndBias(widthPx, tMid, endBias);
    widthPx = applyUniformity(widthPx, bellyProgress, uniformity);
    if (tipMinPx > 0) widthPx = Math.max(widthPx, tipMinPx);

    mx.lineWidth = Math.max(0.5, widthPx);
    mx.globalAlpha =
      baseOpacity01 * baseFlow01 * pressureToFlowScale(midPressure);

    forEachTrack(
      0xdeadbeef, // deterministic seed for ink offsets (used internally)
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

  /* B) Paint fill → clip by mask */
  const paint = CanvasUtil.createLayer(options.width, options.height);
  const px = paint.getContext("2d", { alpha: true }) as Ctx2D;
  px.fillStyle = options.color ?? "#000000";
  px.fillRect(0, 0, options.width, options.height);
  Blend.withComposite(px, "destination-in", () => {
    px.drawImage(mask, 0, 0);
  });

  // Optional: micro anti-halo carve
  const carve = clamp01(
    (overrides.edgeCarveAlpha as number | undefined) ?? 0.06
  );
  if (carve > 0.001) {
    const blurred = CanvasUtil.createLayer(options.width, options.height);
    const bx = blurred.getContext("2d", { alpha: true }) as Ctx2D;
    bx.filter = "blur(0.25px)";
    bx.drawImage(paint, 0, 0);
    bx.filter = "none";
    Blend.withCompositeAndAlpha(px, "destination-out", carve, () => {
      px.drawImage(blurred, 0, 0);
    });
  }

  /* C) Composite to destination */
  Blend.withComposite(ctx, "source-over", () => {
    ctx.drawImage(paint, 0, 0);
  });
}

export const drawStampInk = drawInk;
