// FILE: src/lib/brush/backends/stamping/graphite.ts
// Graphite/Charcoal stamping path — paper tooth + inner grain + optional rim
// Strict TS: no `any`, compatible with exactOptionalPropertyTypes

import { Rand, Texture, CanvasUtil, Blend } from "@backends";
import type { Ctx2D, ExtRenderOptions, Gate, SamplePoint } from "./types";
import {
  ov,
  clamp01,
  mix,
  tipBlend,
  applyEndBias,
  applyUniformity,
  bellyAlphaDampFromProgress,
  highPressureDamp,
  widthEndSqueeze,
  pressureToFlowScale,
  pressureToWidthScale,
} from "./utils";
import { toInputQualityFromInput, toPressureMapFromInput } from "./inputMaps";
import { forEachTrack } from "./tracks";
import {
  pathToStamps,
  type TaperProfile,
} from "@/lib/brush/backends/utils/stroke";

const TIP_CULL_RADIUS_PX = 0;

export function drawGraphite(ctx: Ctx2D, options: ExtRenderOptions): void {
  const pts = options.path ?? [];
  if (pts.length < 2) return;

  const overrides = (options.engine.overrides ?? {}) as Required<
    NonNullable<typeof options.engine.overrides>
  >;

  // Per-brush knobs
  const innerGrainAlpha = clamp01(ov(overrides, "innerGrainAlpha", 0.55));
  const edgeCarveAlpha = clamp01(ov(overrides, "edgeCarveAlpha", 0.26));

  const baseFlow01 = clamp01((overrides.flow ?? 64) / 100);
  const baseOpacity01 = clamp01((overrides.opacity ?? 100) / 100);
  const baseSizePx = Math.max(
    1,
    options.baseSizePx * (options.engine.shape?.sizeScale ?? 1)
  );

  // RNG (stable across passes)
  const seed = (options.seed ?? 42) >>> 0;
  const rng = Rand.mulberry32(seed);

  // Respect input pressure/quality and guarantee required fields
  const pmap = toPressureMapFromInput(options.input);
  const iq = toInputQualityFromInput(options.input);

  // Shape/grain quick lookup
  const shapeType = options.engine.shape?.type;
  const grainKind = options.engine.grain?.kind ?? "none";
  const grainDepth = options.engine.grain?.depth ?? 0;
  const isCharcoal =
    shapeType === "charcoal" ||
    (grainKind === "noise" && shapeType !== "round");

  // Stroke placement defaults (tight spacing for pencils/pens)
  const spacingPercent =
    options.engine.strokePath?.spacing ??
    overrides.spacing ??
    (shapeType === "round" ? 9 : 12);
  const jitterPercent =
    (options.engine.strokePath?.jitter ?? overrides.jitter ?? 0.5) * 100; // stroke.ts expects %
  const scatterPx =
    options.engine.strokePath?.scatter ?? overrides.scatter ?? 0;
  const stampsPerStep =
    options.engine.strokePath?.count ?? overrides.count ?? 1;
  const streamline = options.engine.strokePath?.streamline ?? 0;

  // Taper/body knobs
  const tipScaleStart = overrides.tipScaleStart ?? 0.85;
  const tipScaleEnd = overrides.tipScaleEnd ?? 0.85;
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
    uniformity: overrides.uniformity ?? 0,
    rng,
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

  // v34 taper/body knobs (safe clamps)
  const tipStart = clamp01(tipScaleStart);
  const tipEnd = clamp01(tipScaleEnd);
  const tipMinPx = Math.max(0, overrides.tipMinPx ?? 0);
  const bellyGain = Math.max(0.5, overrides.bellyGain ?? 1.0);
  const endBias = Math.max(-1, Math.min(1, overrides.endBias ?? 0));
  const uniformity = clamp01(overrides.uniformity ?? 0);

  // Split nibs (prefer strokePath.count; fallback to overrides)
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
  const tiltToSplitFan = (overrides.tiltToSplitFan ?? 0) * (Math.PI / 180); // no tilt threaded yet

  // Tooth & rim (declare once here; local to function to avoid redeclare errors)
  const toothBody = clamp01(
    ov(overrides, "toothBody", isCharcoal ? 0.75 : 0.55)
  );
  const toothFlank = clamp01(
    ov(overrides, "toothFlank", isCharcoal ? 1.0 : 0.85)
  );
  const toothScale = (ov(overrides, "toothScale", 0) as number) || 0;
  const rimMode = ov<"auto" | "on" | "off">(overrides, "rimMode", "auto");
  const rimStrength = ov(overrides, "rimStrength", 0.12) as number;

  /* -------------------- A) Stroke mask -------------------- */
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
      (ax, ay, bx, by) => {
        mx.beginPath();
        mx.moveTo(ax, ay);
        mx.lineTo(bx, by);
        mx.stroke();
      }
    );
  }

  // Pass 2 — narrow spine (slight blur for cohesion)
  mx.filter = "blur(0.22px)";
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
      (ax, ay, bx, by) => {
        mx.beginPath();
        mx.moveTo(ax, ay);
        mx.lineTo(bx, by);
        mx.stroke();
      }
    );
  }
  mx.filter = "none";

  // Edge carve: remove faint halo (per-brush controllable)
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

  /* ---- Paper tooth perforation (multi-scale + random phase) ---- */
  if (toothBody > 0.001 || toothFlank > 0.001) {
    const effectiveTile = (() => {
      const ts = toothScale || 0;
      if (ts > 1) return Math.max(2, Math.min(512, Math.floor(ts)));
      const s = Math.round(baseSizePx * (isCharcoal ? 1.6 : 1.35));
      return Math.max(2, Math.min(512, s));
    })();

    const bodyDensity = isCharcoal ? 0.22 : 0.12;
    const flankDensity = isCharcoal ? 0.34 : 0.18;

    const noiseTile = Texture.makeAlphaNoiseTile(
      seed ^ 0x77aa,
      Math.max(2, Math.floor(effectiveTile * 0.9)),
      0.6,
      1
    );

    // Body gate
    if (toothBody > 0.001) {
      const bodyGate = CanvasUtil.createLayer(options.width, options.height);
      const bg = bodyGate.getContext("2d", { alpha: true }) as Ctx2D;
      bg.strokeStyle = "#fff";
      bg.lineCap = "round";
      bg.lineJoin = "round";

      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1];
        const b = samples[i];
        const gate = gates[i - 1];
        if (!a || !b || !gate) continue;

        const { bellyProgress, alphaProgress, midPressure, tMid } = gate;
        if (alphaProgress <= 0.001) continue;

        const wScale = pressureToWidthScale(midPressure);
        const innerW =
          baseSizePx *
          wScale *
          (0.26 * Math.pow(bellyProgress, 0.9) + 0.18) *
          widthEndSqueeze(tMid);

        bg.lineWidth = Math.max(0.75, innerW);
        const centerEase = mix(0.7, 0.4, 1 - toothBody);
        bg.globalAlpha = alphaProgress * centerEase;

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
          (ax, ay, bx, by) => {
            bg.beginPath();
            bg.moveTo(ax, ay);
            bg.lineTo(bx, by);
            bg.stroke();
          }
        );
      }

      // Body holes (two tiles)
      const bodyHoles = CanvasUtil.createLayer(options.width, options.height);
      const bhx = bodyHoles.getContext("2d", { alpha: true }) as Ctx2D;

      const bodyTileA = Texture.makeHoleDotTile(
        seed ^ 0x1144,
        effectiveTile,
        bodyDensity
      );
      const bodyTileB = Texture.makeHoleDotTile(
        seed ^ 0x3344,
        Math.max(2, Math.round(effectiveTile * 0.62)),
        bodyDensity * 0.75
      );

      Texture.fillPatternWithRandomPhase(
        bhx,
        bodyTileA,
        options.width,
        options.height,
        () => rng.nextFloat()
      );
      bhx.globalAlpha = 0.7;
      Texture.fillPatternWithRandomPhase(
        bhx,
        bodyTileB,
        options.width,
        options.height,
        () => rng.nextFloat()
      );
      bhx.globalAlpha = 1;

      Blend.withComposite(bhx, "destination-in", () => {
        bhx.fillStyle = noiseTile;
        bhx.fillRect(0, 0, options.width, options.height);
        bhx.drawImage(bodyGate, 0, 0);
      });

      Blend.withCompositeAndAlpha(mx, "destination-out", toothBody, () => {
        mx.drawImage(bodyHoles, 0, 0);
      });
    }

    // Flank gate
    if (toothFlank > 0.001) {
      const flankGate = CanvasUtil.createLayer(options.width, options.height);
      const fg = flankGate.getContext("2d", { alpha: true }) as Ctx2D;
      fg.strokeStyle = "#fff";
      fg.lineCap = "round";
      fg.lineJoin = "round";

      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1];
        const b = samples[i];
        const gate = gates[i - 1];
        if (!a || !b || !gate) continue;

        const { bellyProgress, alphaProgress, midPressure, tMid } = gate;
        if (alphaProgress <= 0.001) continue;

        const wScale = pressureToWidthScale(midPressure);
        const flankW =
          baseSizePx *
          wScale *
          (0.22 * Math.pow(bellyProgress, 0.9) + 0.1) *
          widthEndSqueeze(tMid);

        fg.lineWidth = Math.max(0.5, flankW);
        fg.globalAlpha = 0.8 * alphaProgress;

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
          (ax, ay, bx, by) => {
            fg.beginPath();
            fg.moveTo(ax, ay);
            fg.lineTo(bx, by);
            fg.stroke();
          }
        );
      }

      const flankHoles = CanvasUtil.createLayer(options.width, options.height);
      const fhx = flankHoles.getContext("2d", { alpha: true }) as Ctx2D;

      const flankTileA = Texture.makeHoleDotTile(
        seed ^ 0x2288,
        effectiveTile,
        flankDensity
      );
      const flankTileB = Texture.makeHoleDotTile(
        seed ^ 0x5588,
        Math.max(2, Math.round(effectiveTile * 0.7)),
        flankDensity * 0.85
      );

      Texture.fillPatternWithRandomPhase(
        fhx,
        flankTileA,
        options.width,
        options.height,
        () => rng.nextFloat()
      );
      fhx.globalAlpha = 0.75;
      Texture.fillPatternWithRandomPhase(
        fhx,
        flankTileB,
        options.width,
        options.height,
        () => rng.nextFloat()
      );
      fhx.globalAlpha = 1;

      Blend.withComposite(fhx, "destination-in", () => {
        fhx.drawImage(flankGate, 0, 0);
      });

      // drawImage accepts CanvasImageSource; the canvas union satisfies it
      mx.globalCompositeOperation = "destination-out";
      mx.globalAlpha = toothFlank;
      mx.drawImage(fhx.canvas as CanvasImageSource, 0, 0);
      mx.globalAlpha = 1;
      mx.globalCompositeOperation = "source-over";
    }
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

  /* -------------------- C) Inner-belly grain (respects holes) -------------------- */
  const wantInteriorGrain =
    (options.engine.grain?.kind ?? "none") !== "none" &&
    grainDepth > 0 &&
    innerGrainAlpha > 0.001;

  if (wantInteriorGrain) {
    const inner = CanvasUtil.createLayer(options.width, options.height);
    const ix = inner.getContext("2d", { alpha: true }) as Ctx2D;
    ix.strokeStyle = "#fff";
    ix.lineCap = "round";
    ix.lineJoin = "round";

    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      const gate = gates[i - 1];
      if (!a || !b || !gate) continue;

      const { bellyProgress, alphaProgress, midPressure, tMid } = gate;
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
        (ax, ay, bx, by) => {
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

    // constrain grain to inner gate & mask
    Blend.withComposite(gx, "destination-in", () => {
      gx.drawImage(inner, 0, 0);
      gx.drawImage(mask, 0, 0);
    });

    // multiply grain onto the PAINT layer
    Blend.withCompositeAndAlpha(px, "multiply", innerGrainAlpha, () => {
      px.drawImage(grain, 0, 0);
    });
  }

  /* -------------------- D) Tip rim (screen, pencils only) -------------------- */
  const useRim = rimMode === "on" || (rimMode === "auto" && !isCharcoal);
  if (useRim) {
    const rim = CanvasUtil.createLayer(options.width, options.height);
    const rx = rim.getContext("2d", { alpha: true }) as Ctx2D;
    rx.strokeStyle = "#fff";
    rx.lineCap = "round";
    rx.lineJoin = "round";

    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      const gate = gates[i - 1];
      if (!a || !b || !gate) continue;

      const { bellyProgress, alphaProgress, midPressure, tMid } = gate;
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
        (ax, ay, bx, by) => {
          rx.beginPath();
          rx.moveTo(ax, ay);
          rx.lineTo(bx, by);
          rx.stroke();
        }
      );
    }

    // screen rim onto the PAINT layer
    Blend.withComposite(px, "screen", () => {
      px.drawImage(rim, 0, 0);
    });
  }

  /* -------------------- E) Draw paint to the offscreen ctx -------------------- */
  Blend.withComposite(ctx, "source-over", () => {
    ctx.drawImage(paint, 0, 0);
  });
}
