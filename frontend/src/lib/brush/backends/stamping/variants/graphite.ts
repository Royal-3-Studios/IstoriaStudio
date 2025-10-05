// FILE: src/lib/brush/backends/stamping/variants/graphite.ts
// Graphite/Charcoal stamping — paper tooth + inner grain + optional rim
// Strict TS: no `any`, compatible with exactOptionalPropertyTypes.

import type { RenderOptions, RenderOverrides } from "@/lib/brush/engine";
import type { BrushInputConfig } from "@/data/brushPresets";
import { Rand, Texture, CanvasUtil, Blend } from "@backends";

import type { Ctx2D } from "@backends/utils/canvas";
import { clamp01 } from "../utils/color";
import {
  toPressureMapFromInput,
  toInputQualityFromInput,
} from "../core/inputMap";
import { forEachTrack } from "../core/tracks";
import {
  pathToStamps,
  type TaperProfile,
  type InputQualityOpts,
} from "@/lib/brush/backends/utils/stroke";

/* ------------------------- Local util (no external deps) ------------------------- */

const TIP_CULL_RADIUS_PX = 0;

const num = (v: unknown, d: number): number => (typeof v === "number" ? v : d);
const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

/** Pressure → width and flow shaping */
function pressureToWidthScale(p01: number): number {
  const q = Math.pow(clamp01(p01), 0.65);
  return 0.85 + q * 0.45;
}
function pressureToFlowScale(p01: number): number {
  const q = Math.pow(clamp01(p01), 1.15);
  return 0.4 + q * 0.6;
}

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

export function drawGraphite(ctx: Ctx2D, options: ExtRenderOptions): void {
  const pts = options.path ?? [];
  if (pts.length < 2) return;

  const overrides = (options.engine.overrides ??
    {}) as Partial<RenderOverrides>;

  // Brush knobs
  const innerGrainAlpha = clamp01(
    num((overrides as Record<string, number>).innerGrainAlpha, 0.55)
  );
  const edgeCarveAlpha = clamp01(
    num((overrides as Record<string, number>).edgeCarveAlpha, 0.26)
  );

  const baseFlow01 = clamp01(num(overrides.flow, 64) / 100);
  const baseOpacity01 = clamp01(num(overrides.opacity, 100) / 100);
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
    rng: Rand.mulberry32(seed),
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
  const tiltToSplitFan = num(overrides.tiltToSplitFan, 0) * (Math.PI / 180); // no tilt threaded yet

  /* -------------------- A) Stroke mask -------------------- */
  const mask = CanvasUtil.createLayer(options.width, options.height);
  const mx = mask.getContext("2d", { alpha: true }) as Ctx2D;
  mx.strokeStyle = "#000";
  mx.lineCap = "round";
  mx.lineJoin = "round";

  // Pass 1 — main body
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const { bellyProgress, alphaProgress, midPressure, tMid } = gates[i - 1]!;
    if (alphaProgress <= 0.001) continue;

    let widthPx =
      baseSizePx *
      pressureToWidthScale(midPressure) *
      (bellyGain * 0.31 * Math.pow(bellyProgress, 0.75)) *
      widthEndSqueeze(tMid);

    widthPx *= tipBlend(tMid, tipStart, tipEnd);
    widthPx = applyEndBias(widthPx, tMid, endBias);
    widthPx = applyUniformity(widthPx, bellyProgress, uniformity);
    if (tipMinPx > 0) widthPx = Math.max(widthPx, tipMinPx);
    if (0.5 * widthPx < TIP_CULL_RADIUS_PX) continue;

    mx.lineWidth = Math.max(0.5, widthPx);
    mx.globalAlpha =
      baseOpacity01 *
      0.76 *
      baseFlow01 *
      pressureToFlowScale(midPressure) *
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

    let widthPx =
      baseSizePx *
      pressureToWidthScale(midPressure) *
      (bellyGain * 0.155 * Math.pow(bellyProgress, 0.95)) *
      widthEndSqueeze(tMid);

    widthPx *= tipBlend(tMid, tipStart, tipEnd);
    widthPx = applyEndBias(widthPx, tMid, endBias);
    widthPx = applyUniformity(widthPx, bellyProgress, uniformity);
    if (tipMinPx > 0) widthPx = Math.max(widthPx, tipMinPx);

    mx.lineWidth = Math.max(0.5, widthPx);
    mx.globalAlpha =
      baseOpacity01 *
      0.33 *
      baseFlow01 *
      pressureToFlowScale(midPressure) *
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

  // Edge carve: remove faint halo (configurable)
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

  /* -------------------- C) Inner-belly grain (optional) -------------------- */
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

      const innerW =
        baseSizePx *
        pressureToWidthScale(midPressure) *
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
    const tileA = Texture.makeMultiplyTile(seed ^ 0x0999, 24, 0.17);
    const tileB = Texture.makeMultiplyTile(seed ^ 0x2ab3, 20, 0.14);
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

      rx.lineWidth = Math.max(
        1,
        baseSizePx *
          pressureToWidthScale(midPressure) *
          (0.14 * bellyProgress + 0.08)
      );
      rx.globalAlpha = Math.pow(1 - alphaProgress, 0.85) * rimStrength;

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

  /* -------------------- E) Composite to target -------------------- */
  Blend.withComposite(ctx, "source-over", () => {
    ctx.drawImage(paint, 0, 0);
  });
}
export const drawStampGraphite = drawGraphite;
