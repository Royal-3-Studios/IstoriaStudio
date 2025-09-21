// FILE: src/lib/brush/backends/stamping.ts
/**
 * Stamping Backend — Graphite/Charcoal & Inking (v35)
 * ---------------------------------------------------
 * - Multi-track “split nibs” (count/spacing/jitter/curvature/asymmetry/scatter/angle)
 * - Shared utils for RNG, spacing/resample, canvas layers, blending, textures
 * - Per-brush knobs (innerGrainAlpha, edgeCarveAlpha) threaded from engine overrides
 * - Short-circuits disabled stages for perf (when alpha ≈ 0, grain off, etc.)
 */

import type {
  RenderOptions,
  RenderOverrides,
  RenderPathPoint,
} from "@/lib/brush/engine";
import {
  Rand,
  Stroke as StrokeUtil,
  Texture,
  CanvasUtil,
  Blend,
} from "@backends";

type Ctx2D = CanvasUtil.Ctx2D;

/* ============================== Small math helpers ============================== */

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const mix = lerp;

/* ============================== Typed override getter =========================== */

function ov<T>(
  overrides: Required<RenderOverrides>,
  key: keyof RenderOverrides,
  fallback: T
): T {
  const raw = (overrides as unknown as Record<string, unknown>)[key];
  return (raw as T) ?? fallback;
}

/* ============================== Geometry helpers =============================== */

function segmentNormal(ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  return { nx, ny };
}

/* ============================== Taper/body shaping ============================ */

const EDGE_WINDOW_FRACTION = 0.42;

function bellyProgress01(tNorm: number, edgeFrac = EDGE_WINDOW_FRACTION) {
  const d = Math.min(tNorm, 1 - tNorm);
  return clamp01(d / edgeFrac);
}

function softTipMask01(tNorm: number, edgeFrac = EDGE_WINDOW_FRACTION) {
  const p = bellyProgress01(tNorm, edgeFrac);
  const exponent = 2.7;
  return p < 1 ? Math.pow(p, exponent) : 1;
}

function widthEndSqueeze(tNorm: number) {
  const a = softTipMask01(tNorm);
  return 0.84 + 0.12 * a;
}

function bellyAlphaDampFromProgress(progress: number) {
  return 1 - 0.25 * Math.pow(progress, 1.7);
}

function highPressureDamp(p01: number) {
  const q = clamp01(p01);
  return 1 - 0.22 * Math.pow(q, 1.55);
}

function tipBlend(tNorm: number, startAmt: number, endAmt: number) {
  const a = softTipMask01(tNorm); // 0→1
  const towardStart = 1 - Math.min(1, tNorm * 2); // 1 at start → 0 mid
  const towardEnd = 1 - Math.min(1, (1 - tNorm) * 2); // 1 at end → 0 mid
  const tipAmt = startAmt * towardStart + endAmt * towardEnd;
  return 1 - tipAmt + tipAmt * a;
}

function applyEndBias(width: number, tNorm: number, bias: number) {
  const k = (tNorm - 0.5) * 2; // -1 at start, +1 at end
  return width * (1 + 0.28 * bias * k);
}

function applyUniformity(width: number, belly01: number, u: number) {
  const dev = 0.31 * Math.pow(belly01, 0.75);
  const devScaled = dev * (1 - u);
  const factor = dev > 0 ? devScaled / dev : 1;
  return width * factor;
}

/* ============================== Pressure maps ============================ */

function pressureToWidthScale(p01: number) {
  const q = Math.pow(clamp01(p01), 0.65);
  return 0.85 + q * 0.45;
}
function pressureToFlowScale(p01: number) {
  const q = Math.pow(clamp01(p01), 1.15);
  return 0.4 + q * 0.6;
}

/* ============================== Sampling along path ============================ */

type SamplePoint = { x: number; y: number; t: number; p: number };

function resamplePath(
  points: ReadonlyArray<RenderPathPoint>,
  stepPx: number
): SamplePoint[] {
  if (StrokeUtil?.resamplePath) {
    return StrokeUtil.resamplePath(
      points as RenderPathPoint[],
      stepPx
    ) as SamplePoint[];
  }

  const out: SamplePoint[] = [];
  if (!points || points.length < 2) return out;

  const N = points.length;
  const segLen: number[] = new Array(N).fill(0);
  let total = 0;
  for (let i = 1; i < N; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const L = Math.hypot(dx, dy);
    segLen[i] = L;
    total += L;
  }
  if (total <= 0) return out;

  const prefix: number[] = new Array(N).fill(0);
  for (let i = 1; i < N; i++) prefix[i] = prefix[i - 1] + segLen[i];

  function posAt(sArc: number) {
    const s = Math.max(0, Math.min(total, sArc));
    let idx = 1;
    while (idx < N && prefix[idx] < s) idx++;
    const i0 = Math.max(1, idx);
    const prevS = prefix[i0 - 1];
    const L = segLen[i0];
    const u = L > 0 ? (s - prevS) / L : 0;

    const a = points[i0 - 1];
    const b = points[i0];
    const ap = typeof a.pressure === "number" ? clamp01(a.pressure) : 0.7;
    const bp = typeof b.pressure === "number" ? clamp01(b.pressure) : 0.7;
    const p = lerp(ap, bp, u);

    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, p };
  }

  const first = posAt(0);
  out.push({ x: first.x, y: first.y, t: 0, p: first.p });

  const step = Math.max(0.3, Math.min(0.75, stepPx));
  for (let s = step; s < total; s += step) {
    const p = posAt(s);
    out.push({ x: p.x, y: p.y, t: s / total, p: p.p });
  }
  const last = posAt(total);
  out.push({ x: last.x, y: last.y, t: 1, p: last.p });

  return out;
}

/* ============================== Render ======================================== */

const TIP_CULL_RADIUS_PX = 0;

export default function drawStamping(ctx: Ctx2D, options: RenderOptions): void {
  const pts = options.path ?? [];
  if (pts.length < 2) return;

  const overrides = (options.engine.overrides ??
    {}) as Required<RenderOverrides>;

  // Allow presets to disable certain stages and govern behavior
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

  // Spacing from UI/overrides (shared Stroke util if present)
  const uiSpacing =
    options.engine.strokePath?.spacing ?? options.engine.overrides?.spacing;
  const spacingFrac = StrokeUtil?.resolveSpacingFraction
    ? StrokeUtil.resolveSpacingFraction(uiSpacing, 3)
    : (() => {
        const raw = typeof uiSpacing === "number" ? uiSpacing : 3;
        const frac = raw > 1 ? raw / 100 : raw;
        return Math.max(0.02, Math.min(0.08, frac));
      })();
  const resampleStepPx = Math.max(
    0.3,
    Math.min(0.75, baseSizePx * spacingFrac)
  );
  const samples = resamplePath(pts, resampleStepPx);
  if (samples.length < 2) return;

  // Gates per segment
  type Gate = {
    tMid: number;
    bellyProgress: number;
    alphaProgress: number;
    midPressure: number;
  };
  const gates: Gate[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const tMid = (a.t + b.t) * 0.5;
    gates.push({
      tMid,
      bellyProgress: bellyProgress01(tMid),
      alphaProgress: softTipMask01(tMid),
      midPressure: (a.p + b.p) * 0.5,
    });
  }

  const shapeType = options.engine.shape?.type;
  const grainKind = options.engine.grain?.kind ?? "none";
  const grainDepth = options.engine.grain?.depth ?? 0;
  const isCharcoal =
    shapeType === "charcoal" ||
    (grainKind === "noise" && shapeType !== "round");

  // v34 taper/body knobs (safe clamps)
  const tipStart = clamp01(overrides.tipScaleStart ?? 0.85);
  const tipEnd = clamp01(overrides.tipScaleEnd ?? 0.85);
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
  const tiltToSplitFan = (overrides.tiltToSplitFan ?? 0) * (Math.PI / 180); // currently unused (no tilt in path)

  // Convenience reads for tooth & rim
  const toothBody = clamp01(
    ov(overrides, "toothBody", isCharcoal ? 0.75 : 0.55)
  );
  const toothFlank = clamp01(
    ov(overrides, "toothFlank", isCharcoal ? 1.0 : 0.85)
  );
  const toothScale = ov(overrides, "toothScale", 0) as number;
  const rimMode = ov<"auto" | "on" | "off">(overrides, "rimMode", "auto");
  const rimStrength = ov(overrides, "rimStrength", 0.12) as number;

  /* -------------------- A) Stroke mask -------------------- */

  const mask = CanvasUtil.createLayer(options.width, options.height);
  const mx = mask.getContext("2d", { alpha: true }) as Ctx2D;
  mx.strokeStyle = "#000";
  mx.lineCap = "round";
  mx.lineJoin = "round";

  function forEachTrack(
    tMid: number,
    pMid: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cb: (
      oxA: number,
      oyA: number,
      oxB: number,
      oyB: number,
      r: () => number
    ) => void
  ) {
    const { nx, ny } = segmentNormal(ax, ay, bx, by);

    // Fan angle from overrides (tiltToSplitFan ignored until tilt is threaded through path points)
    const fanAngle = splitAngle + tiltToSplitFan * 0;

    // Rotate normal by fan angle
    const c = Math.cos(fanAngle);
    const s = Math.sin(fanAngle);
    const rx = c * nx - s * ny;
    const ry = s * nx + c * ny;

    for (let k = 0; k < splitCount; k++) {
      const rTrack = Rand.mulberry32((seed ^ 0x1000) + k * 97);
      const randF = () => rTrack.nextFloat();

      const center = (splitCount - 1) / 2;
      const baseSep = splitSpacing * (k - center);
      const jittered = baseSep * (1 + (randF() * 2 - 1) * splitSpacingJitter);

      const pressSep = 1 + pressureToSplitSpacing * ((pMid - 0.5) * 2);
      const curve = 1 + splitCurvature * (2 * tMid - 1);
      const asym = 1 + splitAsymmetry * ((k - center) / (center || 1));

      const sep = jittered * pressSep * curve * asym;
      const sc = splitScatter > 0 ? (randF() * 2 - 1) * splitScatter : 0;

      const ox = rx * sep + nx * sc;
      const oy = ry * sep + ny * sc;

      cb(ax + ox, ay + oy, bx + ox, by + oy, randF);
    }
  }

  // Pass 1 — main body
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const { bellyProgress, alphaProgress, midPressure, tMid } = gates[i - 1];
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

    forEachTrack(tMid, midPressure, a.x, a.y, b.x, b.y, (ax, ay, bx, by) => {
      mx.beginPath();
      mx.moveTo(ax, ay);
      mx.lineTo(bx, by);
      mx.stroke();
    });
  }

  // Pass 2 — narrow spine (slight blur for cohesion)
  mx.filter = "blur(0.22px)";
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const { bellyProgress, alphaProgress, midPressure, tMid } = gates[i - 1];
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

    forEachTrack(tMid, midPressure, a.x, a.y, b.x, b.y, (ax, ay, bx, by) => {
      mx.beginPath();
      mx.moveTo(ax, ay);
      mx.lineTo(bx, by);
      mx.stroke();
    });
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

    // Build gates (body)
    if (toothBody > 0.001) {
      const bodyGate = CanvasUtil.createLayer(options.width, options.height);
      const bg = bodyGate.getContext("2d", { alpha: true }) as Ctx2D;
      bg.strokeStyle = "#fff";
      bg.lineCap = "round";
      bg.lineJoin = "round";

      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1];
        const b = samples[i];
        const { bellyProgress, alphaProgress, midPressure, tMid } =
          gates[i - 1];
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

      // Body holes (two combined tiles)
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

    // Build gates (flank)
    if (toothFlank > 0.001) {
      const flankGate = CanvasUtil.createLayer(options.width, options.height);
      const fg = flankGate.getContext("2d", { alpha: true }) as Ctx2D;
      fg.strokeStyle = "#fff";
      fg.lineCap = "round";
      fg.lineJoin = "round";

      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1];
        const b = samples[i];
        const { bellyProgress, alphaProgress, midPressure, tMid } =
          gates[i - 1];
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

      // Flank holes
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

      Blend.withCompositeAndAlpha(mx, "destination-out", toothFlank, () => {
        mx.drawImage(fhx.canvas as unknown as CanvasImageSource, 0, 0);
      });
    }
  }

  /* -------------------- B) Colorize mask into a paint layer ---------------- */
  const paint = CanvasUtil.createLayer(options.width, options.height);
  const px = paint.getContext("2d", { alpha: true }) as Ctx2D;

  // 1) Fill with the brush color
  px.fillStyle = options.color ?? "#000000";
  px.fillRect(0, 0, options.width, options.height);

  // 2) Clip by the mask we just built
  Blend.withComposite(px, "destination-in", () => {
    px.drawImage(mask, 0, 0);
  });

  /* -------------------- C) Inner-belly grain (respects holes) ------------- */
  const wantInteriorGrain =
    grainKind !== "none" && grainDepth > 0 && innerGrainAlpha > 0.001;

  if (wantInteriorGrain) {
    const inner = CanvasUtil.createLayer(options.width, options.height);
    const ix = inner.getContext("2d", { alpha: true }) as Ctx2D;
    ix.strokeStyle = "#fff";
    ix.lineCap = "round";
    ix.lineJoin = "round";

    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      const { bellyProgress, alphaProgress, midPressure, tMid } = gates[i - 1];
      if (alphaProgress <= 0.001) continue;

      const innerW =
        baseSizePx *
        pressureToWidthScale(midPressure) *
        (0.32 * Math.pow(bellyProgress, 0.9) + 0.2);
      ix.lineWidth = Math.max(1, innerW);
      ix.globalAlpha = 0.75 * alphaProgress;

      forEachTrack(tMid, midPressure, a.x, a.y, b.x, b.y, (ax, ay, bx, by) => {
        ix.beginPath();
        ix.moveTo(ax, ay);
        ix.lineTo(bx, by);
        ix.stroke();
      });
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
      gx.drawImage(mask, 0, 0); // respects perforations
    });

    // multiply grain onto the PAINT layer (not the offscreen ctx)
    Blend.withCompositeAndAlpha(px, "multiply", innerGrainAlpha, () => {
      px.drawImage(grain, 0, 0);
    });
  }

  /* -------------------- D) Tip rim (screen, pencils only) ----------------- */
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
      const { bellyProgress, alphaProgress, midPressure, tMid } = gates[i - 1];
      if (alphaProgress <= 0.001) continue;

      rx.lineWidth = Math.max(
        1,
        baseSizePx *
          pressureToWidthScale(midPressure) *
          (0.14 * bellyProgress + 0.08)
      );
      rx.globalAlpha = Math.pow(1 - alphaProgress, 0.85) * rimStrength;

      forEachTrack(tMid, midPressure, a.x, a.y, b.x, b.y, (ax, ay, bx, by) => {
        rx.beginPath();
        rx.moveTo(ax, ay);
        rx.lineTo(bx, by);
        rx.stroke();
      });
    }

    // screen rim onto the PAINT layer
    Blend.withComposite(px, "screen", () => {
      px.drawImage(rim, 0, 0);
    });
  }

  /* -------------------- E) Draw paint to the offscreen ctx ---------------- */
  Blend.withComposite(ctx, "source-over", () => {
    ctx.drawImage(paint, 0, 0);
  });
}

export const backendId = "stamping" as const;

export async function drawStampingToCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opt: RenderOptions
): Promise<void> {
  const ctx =
    (canvas.getContext("2d", { alpha: true }) as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null) ?? null;
  if (!ctx) return;
  // DPR is handled by the engine layer; draw in CSS space.
  drawStamping(ctx as Ctx2D, opt);
}
