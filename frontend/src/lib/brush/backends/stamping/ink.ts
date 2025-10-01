// FILE: src/lib/brush/backends/stamping/ink.ts
// Inking path — crisp body, no paper tooth, optional micro anti-halo carve
// Strict TS safe, no `any`, compatible with exactOptionalPropertyTypes

import { CanvasUtil, Blend, Rand } from "@backends";
import type { Ctx2D, ExtRenderOptions, Gate, SamplePoint } from "./types";
import {
  clamp01,
  tipBlend,
  applyEndBias,
  applyUniformity,
  pressureToFlowScale,
  pressureToWidthScale,
} from "./utils";
import { toInputQualityFromInput, toPressureMapFromInput } from "./inputMaps";
import { forEachTrack } from "./tracks";
import {
  pathToStamps,
  type TaperProfile,
} from "@/lib/brush/backends/utils/stroke";

// Near the top of ink.ts
import type { RNG } from "@/lib/brush/backends/utils/random"; // adjust if your path differs

/** Adapter: we only need nextFloat() inside stroke.ts, so cast narrowly. */
function rngFromMulberry(m: { nextFloat: () => number }): RNG {
  // If your RNG interface has many extra members (normal, skip, state, save, ...),
  // stroke.ts won't use them. This cast keeps call sites type-clean.
  return { nextFloat: () => m.nextFloat() } as unknown as RNG;
}

export function drawInk(ctx: Ctx2D, options: ExtRenderOptions): void {
  const pts = options.path ?? [];
  if (pts.length < 2) return;

  const overrides = (options.engine.overrides ?? {}) as Required<
    NonNullable<typeof options.engine.overrides>
  >;

  const baseOpacity01 = clamp01((overrides.opacity ?? 100) / 100);
  const baseFlow01 = clamp01((overrides.flow ?? 100) / 100); // ink defaults to full flow

  // Safe base size (guards against undefined/NaN) — diameter in px
  const sizeRaw =
    typeof options.baseSizePx === "number" &&
    Number.isFinite(options.baseSizePx)
      ? options.baseSizePx
      : 8;
  const scale =
    typeof options.engine.shape?.sizeScale === "number" &&
    Number.isFinite(options.engine.shape.sizeScale)
      ? options.engine.shape.sizeScale
      : 1;
  const baseSizePx = Math.max(0.5, sizeRaw * scale);

  // Deterministic RNG compatible with StrokePlacementOptions
  const seedInk = ((options.seed ?? 42) ^ 0x1a2b3c) >>> 0;

  const pmap = toPressureMapFromInput(options.input);
  const iq = toInputQualityFromInput(options.input);

  // Tighter defaults for ink
  const spacingPercent =
    options.engine.strokePath?.spacing ?? overrides.spacing ?? 7;
  const jitterPercent =
    (options.engine.strokePath?.jitter ?? overrides.jitter ?? 0) * 100;
  const scatterPx =
    options.engine.strokePath?.scatter ?? overrides.scatter ?? 0;
  const stampsPerStep =
    options.engine.strokePath?.count ?? overrides.count ?? 1;
  const streamline = options.engine.strokePath?.streamline ?? 0.1;

  const tipScaleStart = overrides.tipScaleStart ?? 0.9;
  const tipScaleEnd = overrides.tipScaleEnd ?? 0.9;
  const taperProfileStart = (overrides.taperProfileStart ??
    "linear") as TaperProfile;
  const taperProfileEnd = (overrides.taperProfileEnd ??
    "linear") as TaperProfile;

  const stamps = pathToStamps(pts, {
    baseSizePx,
    spacingPercent,
    jitterPercent,
    scatterPx,
    stampsPerStep,
    streamline,
    angleFollowDirection: overrides.angleFollowDirection ?? 1,
    angleJitterDeg: overrides.angleJitter ?? 0,
    tipMinPx: overrides.tipMinPx ?? 0,
    tipScaleStart,
    tipScaleEnd,
    taperProfileStart,
    taperProfileEnd,
    endBias: overrides.endBias ?? 0,
    uniformity: overrides.uniformity ?? 0.5, // tighter shape for ink
    rng: rngFromMulberry(Rand.mulberry32(seedInk)),
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

  const gates: Gate[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    if (!a || !b) continue;
    const tMid = (a.t + b.t) * 0.5;
    const d = Math.min(tMid, 1 - tMid);
    const frac = Math.max(0, Math.min(1, d / 0.42));
    gates.push({
      tMid,
      bellyProgress: frac,
      alphaProgress: frac < 1 ? Math.pow(frac, 2.7) : 1,
      midPressure: (a.p + b.p) * 0.5,
    });
  }
  if (gates.length === 0) return;

  const tipMinPx = Math.max(0, overrides.tipMinPx ?? 0);
  const endBias = Math.max(-1, Math.min(1, overrides.endBias ?? 0));
  const uniformity = clamp01(overrides.uniformity ?? 0.6);

  const splitCount = Math.max(
    1,
    Math.round(options.engine.strokePath?.count ?? overrides.splitCount ?? 1)
  );
  const splitSpacing = overrides.splitSpacing ?? 0;
  const splitSpacingJitter = clamp01((overrides.splitSpacingJitter ?? 0) / 100);
  const splitCurvature = Math.max(
    -1,
    Math.min(1, overrides.splitCurvature ?? 0)
  );
  const splitAsymmetry = Math.max(
    -1,
    Math.min(1, overrides.splitAsymmetry ?? 0)
  );
  const splitScatter = Math.max(0, overrides.splitScatter ?? 0);
  const splitAngle = (overrides.splitAngle ?? 0) * (Math.PI / 180);
  const pressureToSplitSpacing = clamp01(overrides.pressureToSplitSpacing ?? 0);

  // A) Build alpha mask (single crisp pass)
  const mask = CanvasUtil.createLayer(options.width, options.height);
  const mx = mask.getContext("2d", { alpha: true }) as Ctx2D;
  mx.strokeStyle = "#000";
  mx.lineCap = "round";
  mx.lineJoin = "round";

  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const gate = gates[i - 1];
    if (!a || !b || !gate) continue;

    const { bellyProgress, alphaProgress, midPressure, tMid } = gate;
    if (alphaProgress <= 0.001) continue;

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
      0xdeadbeef, // deterministic seed for ink track offsets
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
      (ax, ay, bx, by) => {
        mx.beginPath();
        mx.moveTo(ax, ay);
        mx.lineTo(bx, by);
        mx.stroke();
      }
    );
  }

  // B) Color fill → clip by mask
  const paint = CanvasUtil.createLayer(options.width, options.height);
  const px = paint.getContext("2d", { alpha: true }) as Ctx2D;
  px.fillStyle = options.color ?? "#000";
  px.fillRect(0, 0, options.width, options.height);
  Blend.withComposite(px, "destination-in", () => {
    px.drawImage(mask, 0, 0);
  });

  // Optional: micro anti-halo carve (very small)
  const carve = clamp01(overrides.edgeCarveAlpha ?? 0.06);
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

  // Composite to destination
  Blend.withComposite(ctx, "source-over", () => {
    ctx.drawImage(paint, 0, 0);
  });
}
