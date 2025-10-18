// FILE: src/lib/brush/backends/stamping/variants/graphite.ts
// Graphite/Charcoal stamping — paper tooth + inner grain + optional rim
// Strict TS: no `any`, compatible with exactOptionalPropertyTypes.

import type {
  RenderOptions,
  RenderOverrides,
  CurvePoint,
} from "@/lib/brush/engine.types";
import type { BrushInputConfig } from "@/data/brushPresets";
import * as Texture from "@backends/utils/texture";
import * as CanvasUtil from "@backends/utils/canvas";
import * as Blend from "@backends/utils/blending";
import { mulberry32 } from "@/lib/brush/backends/utils/random";
import type { Ctx2D } from "@backends/utils/canvas";
import { clamp01 } from "@backends/utils/color";
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

/* ------------------------- Local util (no external deps) ------------------------- */

const TIP_CULL_RADIUS_PX = 0;

const num = (v: unknown, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

/** Stroke body shaping helpers */
function widthEndSqueeze(tNorm: number): number {
  // soft mask toward ends
  const d = Math.min(tNorm, 1 - tNorm);
  const a = clamp01(d / 0.42);
  const soft = a < 1 ? Math.pow(a, 2.7) : 1;
  return 0.84 + 0.12 * soft;
}
function tipBlend(tNorm: number, startAmt: number, endAmt: number): number {
  const d = Math.min(tNorm, 1 - tNorm);
  const a = clamp01(d / 0.42);
  const soft = a < 1 ? Math.pow(a, 2.7) : 1;
  const towardStart = 1 - Math.min(1, tNorm * 2);
  const towardEnd = 1 - Math.min(1, (1 - tNorm) * 2);
  const amt = startAmt * towardStart + endAmt * towardEnd;
  return 1 - amt + amt * soft;
}
function applyEndBias(width: number, tNorm: number, bias: number): number {
  const k = (tNorm - 0.5) * 2; // -1..+1
  return width * (1 + 0.28 * clamp(bias, -1, 1) * k);
}
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
function bellyAlphaDampFromProgress(progress: number): number {
  return 1 - 0.25 * Math.pow(progress, 1.7);
}
function highPressureDamp(p01: number): number {
  const q = clamp01(p01);
  return 1 - 0.22 * Math.pow(q, 1.55);
}

/** Safely read a tilt value (0..1) from a path point, else 0 */
function readTilt01(pt: unknown): number {
  const t = (pt as { tilt?: unknown })?.tilt;
  return typeof t === "number" && Number.isFinite(t) ? clamp01(t) : 0;
}

/* --------------------------------- Types --------------------------------- */

type ExtRenderOptions = RenderOptions & { input?: BrushInputConfig };
type SamplePoint = { x: number; y: number; t: number; p: number };
type Gate = {
  tMid: number;
  bellyProgress: number;
  alphaProgress: number;
  midPressure: number;
};

/* -------------------------------- Renderer -------------------------------- */

export default function drawGraphite(
  ctx: Ctx2D,
  options: ExtRenderOptions
): void {
  const pts = options.path ?? [];
  if (pts.length < 2) return;

  const overrides = (options.engine.overrides ??
    {}) as Partial<RenderOverrides>;

  // === Composite & global alpha =============================================
  const composite: GlobalCompositeOperation =
    (overrides as { composite?: GlobalCompositeOperation }).composite ??
    options.engine.rendering?.blendMode ??
    "source-over";

  const baseFlow01 = clamp01(num(overrides.flow, 64) / 100);
  const baseOpacity01 = clamp01(num(overrides.opacity, 100) / 100);

  // === NEW: Curves for width & flow =========================================
  const pressureToWidthCurve =
    (overrides as { pressureToWidthCurve?: ReadonlyArray<CurvePoint> })
      .pressureToWidthCurve ??
    ([
      { x: 0, y: 0.75 }, // graphite keeps some body at low pressure
      { x: 1, y: 1.25 }, // broad at high pressure
    ] as ReadonlyArray<CurvePoint>);

  const pressureToFlowCurve =
    (overrides as { pressureToFlowCurve?: ReadonlyArray<CurvePoint> })
      .pressureToFlowCurve ??
    ([
      { x: 0, y: 0.4 },
      { x: 1, y: 1 },
    ] as ReadonlyArray<CurvePoint>);

  const speedToFlowCurve =
    (overrides as { speedToFlowCurve?: ReadonlyArray<CurvePoint> })
      .speedToFlowCurve ?? DefaultCurves.easeInOut;

  // We don't have timestamps here; we'll use a geometric proxy (segment length).
  // If the app supplies speedNormRefPxPerSec, approximate a per-frame ref length.
  const speedNormRefPxPerSec = (overrides as { speedNormRefPxPerSec?: number })
    .speedNormRefPxPerSec;

  // === Tilt routing knobs (0..1 scalars) ====================================
  const tiltToGrainScale = num(overrides.tiltToGrainScale, 0);
  const tiltToEdgeNoise = num(overrides.tiltToEdgeNoise, 0);

  // Average tilt across the stroke (0..1)
  const tiltVals: number[] = [];
  for (let i = 0; i < pts.length; i++) tiltVals.push(readTilt01(pts[i]));
  const avgTilt01 =
    tiltVals.length > 0
      ? tiltVals.reduce((a, b) => a + b, 0) / tiltVals.length
      : 0;

  // Brush knobs
  const innerGrainAlpha = clamp01(
    num((overrides as Record<string, number>).innerGrainAlpha, 0.55)
  );
  const edgeCarveAlphaBase = clamp01(
    num((overrides as Record<string, number>).edgeCarveAlpha, 0.26)
  );

  // Edge carve gain with tilt
  const edgeCarveAlpha =
    edgeCarveAlphaBase * (1 + clamp01(tiltToEdgeNoise) * avgTilt01);

  const baseSizePx = Math.max(
    1,
    options.baseSizePx * num(options.engine.shape?.sizeScale, 1)
  );

  const seed = (options.seed ?? 42) >>> 0;

  // Input mapping (non-undefined, defaulted in core/inputMap)
  const pmap = toPressureMapFromInput(options.input);
  const iq: InputQualityOpts = toInputQualityFromInput(options.input);

  // Shape/grain quick lookup
  const shapeType = options.engine.shape?.type;
  const grainKind = options.engine.grain?.kind ?? "none";
  const grainDepth = num(options.engine.grain?.depth, 0);

  // Rim controls (read from overrides with sane fallbacks)
  const rimMode: "auto" | "on" | "off" =
    (overrides.rimMode as "auto" | "on" | "off" | undefined) ?? "auto";
  const isCharcoal =
    shapeType === "charcoal" ||
    (grainKind === "noise" && shapeType !== "round");
  const rimStrength =
    typeof overrides.rimStrength === "number"
      ? overrides.rimStrength
      : isCharcoal
        ? 0.1
        : 0.12;

  // Stroke placement defaults
  const spacingPercent =
    options.engine.strokePath?.spacing ??
    overrides.spacing ??
    (shapeType === "round" ? 9 : 12);

  const jitterPercent =
    num(options.engine.strokePath?.jitter, num(overrides.jitter, 0.5)) * 100;

  const scatterPx = num(
    options.engine.strokePath?.scatter,
    num(overrides.scatter, 0)
  );
  const stampsPerStep = num(
    options.engine.strokePath?.count,
    num(overrides.count, 1)
  );
  const streamline = num(options.engine.strokePath?.streamline, 0);

  // Taper/body knobs
  const tipScaleStart = num(overrides.tipScaleStart, 0.85);
  const tipScaleEnd = num(overrides.tipScaleEnd, 0.85);
  const taperProfileStart = (overrides.taperProfileStart ??
    "linear") as TaperProfile;
  const taperProfileEnd = (overrides.taperProfileEnd ??
    "linear") as TaperProfile;

  // Build stamps (provides x,y,pressure,t∈[0..1] normalized)
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
    uniformity: num(overrides.uniformity, 0),
    rng: mulberry32(seed),
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

  // Per-segment gates
  const gates: Gate[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
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

  // Body shaping
  const tipStart = clamp01(tipScaleStart);
  const tipEnd = clamp01(tipScaleEnd);
  const tipMinPx = Math.max(0, num(overrides.tipMinPx, 0));
  const bellyGain = Math.max(0.5, num(overrides.bellyGain, 1.0));
  const endBias = clamp(num(overrides.endBias, 0), -1, 1);
  const uniformity = clamp01(num(overrides.uniformity, 0));

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
  const tiltToSplitFan = num(overrides.tiltToSplitFan, 0) * (Math.PI / 180);

  // --- Geometric "speed" proxy (maps segment length → 0..1 with a reference) ---
  const refLenPx =
    typeof speedNormRefPxPerSec === "number"
      ? Math.max(1, speedNormRefPxPerSec / 60) // approx px per frame @60Hz
      : Math.max(1, baseSizePx * 0.85);

  const segmentAlphaFactors = (distPx: number) => {
    const speedNorm = clamp01(distPx / refLenPx);
    return {
      sf: evaluateCurve(speedToFlowCurve, speedNorm),
    };
  };

  /* -------------------- A) Stroke mask -------------------- */
  const mask = CanvasUtil.createLayer(options.width, options.height);
  const mx = mask.getContext("2d", { alpha: true }) as Ctx2D;
  mx.strokeStyle = "#000";
  mx.lineCap = "round";
  mx.lineJoin = "round";
  (mx as CanvasRenderingContext2D).globalCompositeOperation = "source-over";

  // Pass 1 — main body
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const { bellyProgress, alphaProgress, midPressure, tMid } = gates[i - 1]!;
    if (alphaProgress <= 0.001) continue;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distPx = Math.hypot(dx, dy);

    const pressureWidthMul = evaluateCurve(
      pressureToWidthCurve,
      clamp01(midPressure)
    );
    let widthPx =
      baseSizePx *
      pressureWidthMul *
      (bellyGain * 0.31 * Math.pow(bellyProgress, 0.75)) *
      widthEndSqueeze(tMid);

    widthPx *= tipBlend(tMid, tipStart, tipEnd);
    widthPx = applyEndBias(widthPx, tMid, endBias);
    widthPx = applyUniformity(widthPx, bellyProgress, uniformity);
    if (tipMinPx > 0) widthPx = Math.max(widthPx, tipMinPx);
    if (0.5 * widthPx < TIP_CULL_RADIUS_PX) continue;

    const pf = evaluateCurve(pressureToFlowCurve, clamp01(midPressure));
    const { sf } = segmentAlphaFactors(distPx);

    mx.lineWidth = Math.max(0.5, widthPx);
    mx.globalAlpha =
      baseOpacity01 *
      0.76 *
      baseFlow01 *
      pf * // pressure curve
      sf * // geometric speed proxy
      Math.pow(alphaProgress, 0.86) *
      bellyAlphaDampFromProgress(bellyProgress) *
      highPressureDamp(midPressure);

    forEachTrack(
      seed,
      splitCount,
      splitSpacing,
      splitSpacingJitter,
      pressureToSplitSpacing,
      splitCurvature,
      splitAsymmetry,
      splitScatter,
      splitAngle + tiltToSplitFan * 0,
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

  // Pass 2 — narrow spine (soft cohesion blur)
  mx.filter = "blur(0.22px)";
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const { bellyProgress, alphaProgress, midPressure, tMid } = gates[i - 1]!;
    if (alphaProgress <= 0.001) continue;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distPx = Math.hypot(dx, dy);

    const pressureWidthMul = evaluateCurve(
      pressureToWidthCurve,
      clamp01(midPressure)
    );
    let widthPx =
      baseSizePx *
      pressureWidthMul *
      (bellyGain * 0.155 * Math.pow(bellyProgress, 0.95)) *
      widthEndSqueeze(tMid);

    widthPx *= tipBlend(tMid, tipStart, tipEnd);
    widthPx = applyEndBias(widthPx, tMid, endBias);
    widthPx = applyUniformity(widthPx, bellyProgress, uniformity);
    if (tipMinPx > 0) widthPx = Math.max(widthPx, tipMinPx);

    const pf = evaluateCurve(pressureToFlowCurve, clamp01(midPressure));
    const { sf } = segmentAlphaFactors(distPx);

    mx.lineWidth = Math.max(0.5, widthPx);
    mx.globalAlpha =
      baseOpacity01 *
      0.33 *
      baseFlow01 *
      pf *
      sf *
      Math.pow(alphaProgress, 0.92) *
      bellyAlphaDampFromProgress(bellyProgress) *
      highPressureDamp(midPressure);

    forEachTrack(
      seed,
      splitCount,
      splitSpacing,
      splitSpacingJitter,
      pressureToSplitSpacing,
      splitCurvature,
      splitAsymmetry,
      splitScatter,
      splitAngle + tiltToSplitFan * 0,
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
  mx.filter = "none";

  // Edge carve amount scales with tilt
  if (edgeCarveAlpha > 0.001) {
    const blurred = CanvasUtil.createLayer(options.width, options.height);
    const bx = blurred.getContext("2d", { alpha: true }) as Ctx2D;
    bx.filter = "blur(0.40px)";
    bx.drawImage(mask, 0, 0);
    bx.filter = "none";

    Blend.withCompositeAndAlpha(mx, "destination-out", edgeCarveAlpha, () => {
      mx.drawImage(blurred, 0, 0);
    });
  }

  /* -------------------- B) Colorize mask into paint layer -------------------- */
  const paint = CanvasUtil.createLayer(options.width, options.height);
  const px = paint.getContext("2d", { alpha: true }) as Ctx2D;

  // 1) Fill with brush color
  px.fillStyle = options.color ?? "#000000";
  px.fillRect(0, 0, options.width, options.height);

  // 2) Clip by mask
  Blend.withComposite(px, "destination-in", () => {
    px.drawImage(mask, 0, 0);
  });

  /* -------------------- C) Inner-belly grain (tilt→scale) -------------------- */
  const wantInner =
    grainKind !== "none" && grainDepth > 0 && innerGrainAlpha > 0.001;

  if (wantInner) {
    const inner = CanvasUtil.createLayer(options.width, options.height);
    const ix = inner.getContext("2d", { alpha: true }) as Ctx2D;
    ix.strokeStyle = "#fff";
    ix.lineCap = "round";
    ix.lineJoin = "round";

    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]!;
      const b = samples[i]!;
      const { bellyProgress, alphaProgress, midPressure, tMid } = gates[i - 1]!;
      if (alphaProgress <= 0.001) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distPx = Math.hypot(dx, dy);

      const pressureWidthMul = evaluateCurve(
        pressureToWidthCurve,
        clamp01(midPressure)
      );
      const innerW =
        baseSizePx *
        pressureWidthMul *
        (0.32 * Math.pow(bellyProgress, 0.9) + 0.2);
      ix.lineWidth = Math.max(1, innerW);
      ix.globalAlpha = 0.75 * alphaProgress;

      forEachTrack(
        seed,
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
          ix.beginPath();
          ix.moveTo(ax, ay);
          ix.lineTo(bx, by);
          ix.stroke();
        }
      );
    }

    const grain = CanvasUtil.createLayer(options.width, options.height);
    const gx = grain.getContext("2d", { alpha: true }) as Ctx2D;

    // grain tile size scales with tilt
    const grainScaleMul = 1 + clamp01(tiltToGrainScale) * avgTilt01;
    const sizeA = Math.max(4, Math.round(24 * grainScaleMul));
    const sizeB = Math.max(4, Math.round(20 * grainScaleMul));

    const tileA = Texture.makeMultiplyTile(seed ^ 0x0999, sizeA, 0.17);
    const tileB = Texture.makeMultiplyTile(seed ^ 0x2ab3, sizeB, 0.14);
    gx.fillStyle = tileA;
    gx.fillRect(0, 0, options.width, options.height);
    gx.globalAlpha = 0.85;
    gx.fillStyle = tileB;
    gx.fillRect(0, 0, options.width, options.height);
    gx.globalAlpha = 1;

    // Constrain grain to inner gate & mask
    Blend.withComposite(gx, "destination-in", () => {
      gx.drawImage(inner, 0, 0);
      gx.drawImage(mask, 0, 0);
    });

    // Multiply grain onto paint
    Blend.withCompositeAndAlpha(px, "multiply", innerGrainAlpha, () => {
      px.drawImage(grain, 0, 0);
    });
  }

  /* -------------------- D) Tip rim (screen, pencils/graphite only) -------------------- */
  const useRim = rimMode === "on" || (rimMode === "auto" && !isCharcoal);
  if (useRim) {
    const rim = CanvasUtil.createLayer(options.width, options.height);
    const rx = rim.getContext("2d", { alpha: true }) as Ctx2D;
    rx.strokeStyle = "#fff";
    rx.lineCap = "round";
    rx.lineJoin = "round";

    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]!;
      const b = samples[i]!;
      const { bellyProgress, alphaProgress, midPressure, tMid } = gates[i - 1]!;
      if (alphaProgress <= 0.001) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distPx = Math.hypot(dx, dy);

      const pressureWidthMul = evaluateCurve(
        pressureToWidthCurve,
        clamp01(midPressure)
      );
      rx.lineWidth = Math.max(
        1,
        baseSizePx * pressureWidthMul * (0.14 * bellyProgress + 0.08)
      );

      // Rim is brightest where body alpha is lowest (edge highlight)
      const { sf } = segmentAlphaFactors(distPx);
      rx.globalAlpha = Math.pow(1 - alphaProgress, 0.85) * (rimStrength * sf);

      forEachTrack(
        seed,
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
          rx.beginPath();
          rx.moveTo(ax, ay);
          rx.lineTo(bx, by);
          rx.stroke();
        }
      );
    }

    // Screen rim onto paint
    Blend.withComposite(px, "screen", () => {
      px.drawImage(rim, 0, 0);
    });
  }

  /* -------------------- E) Composite to target (respect blend) --------------- */
  Blend.withComposite(ctx, composite, () => {
    ctx.drawImage(paint, 0, 0);
  });
}
export const drawStampGraphite = drawGraphite;
