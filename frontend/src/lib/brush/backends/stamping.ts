// FILE: src/lib/brush/backends/stamping.ts
/**
 * 6B Pencil — v31
 * - Adds paper-tooth edge nibble (stationary, pressure/tip aware)
 * - Keeps v30 tuning (slim belly, finer tips, edge carve, quiet rim)
 */

import type {
  RenderOptions,
  RenderOverrides,
  RenderPathPoint,
} from "@/lib/brush/engine";

/* ============================== Math Utils ============================== */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* ============================== Grain Helpers =========================== */

function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Low-contrast near-white noise tile for multiply compositing. */
function makeMultiplyTile(seed: number, size = 24, alpha = 0.16) {
  const rand = makeRng(seed ^ 0x5151);
  const tileCanvas = document.createElement("canvas");
  tileCanvas.width = tileCanvas.height = size;
  const tileCtx = tileCanvas.getContext("2d")!;
  const img = tileCtx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 215 + rand() * 40; // near-white speckle
    img.data[i + 0] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = Math.round(255 * alpha);
  }
  tileCtx.putImageData(img, 0, 0);
  return tileCtx.createPattern(tileCanvas, "repeat")!;
}

/** Sparse alpha speckle tile for subtractive edge tooth (stationary). */
function makeToothTile(seed: number, size = 28, density = 0.6, alpha = 0.24) {
  const rand = makeRng(seed ^ 0x9ad1);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const x = c.getContext("2d")!;
  const img = x.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    // Bernoulli speckle (hard threshold) → crisp micro-bites after blur/carve
    const on = rand() > density;
    img.data[i + 0] = 255; // color doesn't matter for destination-out
    img.data[i + 1] = 255;
    img.data[i + 2] = 255;
    img.data[i + 3] = on ? Math.round(255 * alpha) : 0;
  }
  x.putImageData(img, 0, 0);
  return x.createPattern(c, "repeat")!;
}

/* ============================== Spacing Helpers ========================= */

function resolveSpacingFraction(uiSpacing?: number, fallbackPct = 3): number {
  const raw = typeof uiSpacing === "number" ? uiSpacing : fallbackPct;
  const frac = raw > 1 ? raw / 100 : raw;
  return Math.max(0.02, Math.min(0.08, frac));
}

/* ============================== Taper Controls ========================== */

const EDGE_WINDOW_FRACTION = 0.42;

function bellyProgress01(tNormalized: number, edgeFrac = EDGE_WINDOW_FRACTION) {
  const distanceToEnd = Math.min(tNormalized, 1 - tNormalized);
  return clamp01(distanceToEnd / edgeFrac);
}

function softTipMask01(
  tNormalized: number,
  edgeFrac = EDGE_WINDOW_FRACTION
): number {
  const p = bellyProgress01(tNormalized, edgeFrac);
  const exponent = 2.7;
  return p < 1 ? Math.pow(p, exponent) : 1;
}

function widthEndSqueeze(tNormalized: number) {
  const a = softTipMask01(tNormalized);
  return 0.84 + 0.12 * a;
}

function bellyAlphaDampFromProgress(progress: number) {
  return 1 - 0.25 * Math.pow(progress, 1.7);
}

function highPressureDamp(pressure01: number) {
  const q = clamp01(pressure01);
  return 1 - 0.22 * Math.pow(q, 1.55);
}

const TIP_CULL_RADIUS_PX = 0;

/* ============================== Pressure Mapping ======================== */

function pressureToWidthScale(pressure01: number) {
  const q = Math.pow(clamp01(pressure01), 0.65);
  return 0.85 + q * 0.45;
}
function pressureToFlowScale(pressure01: number) {
  const q = Math.pow(clamp01(pressure01), 1.15);
  return 0.4 + q * 0.6;
}

/* ============================== Resampling ============================== */

type SamplePoint = { x: number; y: number; t: number; p: number };

function resamplePath(
  points: RenderPathPoint[],
  stepPx: number
): SamplePoint[] {
  const samples: SamplePoint[] = [];
  if (!points || points.length < 2) return samples;

  const count = points.length;
  const segmentLengths = new Array<number>(count).fill(0);
  let totalLength = 0;

  for (let i = 1; i < count; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const len = Math.hypot(dx, dy);
    segmentLengths[i] = len;
    totalLength += len;
  }
  if (totalLength <= 0) return samples;

  const prefixLength = new Array<number>(count).fill(0);
  for (let i = 1; i < count; i++)
    prefixLength[i] = prefixLength[i - 1] + segmentLengths[i];

  function positionAt(arcLen: number) {
    const s = Math.max(0, Math.min(totalLength, arcLen));
    let idx = 1;
    while (idx < count && prefixLength[idx] < s) idx++;
    const i0 = Math.max(1, idx);
    const segStart = prefixLength[i0 - 1];
    const segLen = segmentLengths[i0];
    const u = segLen > 0 ? (s - segStart) / segLen : 0;
    const a = points[i0 - 1];
    const b = points[i0];

    const ap = typeof a.pressure === "number" ? clamp01(a.pressure) : 0.7;
    const bp = typeof b.pressure === "number" ? clamp01(b.pressure) : 0.7;
    const pressure = lerp(ap, bp, u);

    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, p: pressure };
  }

  const first = positionAt(0);
  samples.push({ x: first.x, y: first.y, t: 0, p: first.p });

  const step = Math.max(0.3, Math.min(0.75, stepPx));
  for (let s = step; s < totalLength; s += step) {
    const pos = positionAt(s);
    samples.push({ x: pos.x, y: pos.y, t: s / totalLength, p: pos.p });
  }
  const last = positionAt(totalLength);
  samples.push({ x: last.x, y: last.y, t: 1, p: last.p });

  return samples;
}

/* ============================== Render ================================= */

export default function drawStamping(
  ctx: CanvasRenderingContext2D,
  options: RenderOptions
) {
  const pathPoints = options.path ?? [];
  if (pathPoints.length < 2) return;

  const overrides = (options.engine.overrides ??
    {}) as Required<RenderOverrides>;
  const baseFlow01 = clamp01((overrides.flow ?? 64) / 100);

  const baseSizePx = Math.max(
    1,
    options.baseSizePx * (options.engine.shape?.sizeScale ?? 1)
  );

  const rngSeed = (options.seed ?? 42) & 0xffffffff;

  const uiSpacing =
    options.engine.strokePath?.spacing ?? options.engine.overrides?.spacing;
  const spacingFrac = resolveSpacingFraction(uiSpacing, 3);
  const targetStep = baseSizePx * spacingFrac;
  const resampleStepPx = Math.max(0.3, Math.min(0.75, targetStep));

  const samples = resamplePath(pathPoints, resampleStepPx);
  if (samples.length < 2) return;

  type SegmentGate = {
    tMid: number;
    bellyProgress: number;
    alphaProgress: number;
    midPressure: number;
  };
  const gates: SegmentGate[] = [];
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const next = samples[i];
    const tMid = (prev.t + next.t) * 0.5;
    gates.push({
      tMid,
      bellyProgress: bellyProgress01(tMid),
      alphaProgress: softTipMask01(tMid),
      midPressure: (prev.p + next.p) * 0.5,
    });
  }

  /* -------------------- A) Build the stroke mask -------------------- */
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = Math.max(1, Math.floor(options.width));
  maskCanvas.height = Math.max(1, Math.floor(options.height));
  const maskCtx = maskCanvas.getContext("2d", { alpha: true })!;

  maskCtx.globalCompositeOperation = "source-over";
  maskCtx.strokeStyle = "#000";
  maskCtx.lineCap = "round";
  maskCtx.lineJoin = "round";

  // Pass 1: main body
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const next = samples[i];
    const { bellyProgress, alphaProgress, midPressure, tMid } = gates[i - 1];
    if (alphaProgress <= 0.001) continue;

    const widthScale = pressureToWidthScale(midPressure);
    const flowScale = pressureToFlowScale(midPressure);

    const widthPx =
      baseSizePx *
      widthScale *
      (0.31 * Math.pow(bellyProgress, 0.75)) *
      widthEndSqueeze(tMid);

    maskCtx.lineWidth = Math.max(0.5, widthPx);
    maskCtx.globalAlpha =
      0.76 *
      baseFlow01 *
      flowScale *
      Math.pow(alphaProgress, 0.86) *
      bellyAlphaDampFromProgress(bellyProgress) *
      highPressureDamp(midPressure);

    maskCtx.beginPath();
    maskCtx.moveTo(prev.x, prev.y);
    maskCtx.lineTo(next.x, next.y);
    maskCtx.stroke();
  }

  // Pass 2: narrow spine
  maskCtx.filter = "blur(0.22px)";
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const next = samples[i];
    const { bellyProgress, alphaProgress, midPressure, tMid } = gates[i - 1];
    if (alphaProgress <= 0.001) continue;

    const widthScale = pressureToWidthScale(midPressure);
    const flowScale = pressureToFlowScale(midPressure);

    const widthPx =
      baseSizePx *
      widthScale *
      (0.155 * Math.pow(bellyProgress, 0.95)) *
      widthEndSqueeze(tMid);

    maskCtx.lineWidth = Math.max(0.5, widthPx);
    maskCtx.globalAlpha =
      0.33 *
      baseFlow01 *
      flowScale *
      Math.pow(alphaProgress, 0.92) *
      bellyAlphaDampFromProgress(bellyProgress) *
      highPressureDamp(midPressure);

    maskCtx.beginPath();
    maskCtx.moveTo(prev.x, prev.y);
    maskCtx.lineTo(next.x, next.y);
    maskCtx.stroke();
  }
  maskCtx.filter = "none";

  // ---- Edge carve: remove residual halo from maskCanvas ----
  {
    const blurred = document.createElement("canvas");
    blurred.width = maskCanvas.width;
    blurred.height = maskCanvas.height;
    const bx = blurred.getContext("2d", { alpha: true })!;
    bx.filter = "blur(0.39px)";
    bx.drawImage(maskCanvas, 0, 0);
    bx.filter = "none";
    bx.globalCompositeOperation = "destination-out";
    bx.drawImage(maskCanvas, 0, 0);
    maskCtx.save();
    maskCtx.globalCompositeOperation = "destination-out";
    maskCtx.globalAlpha = 0.26;
    maskCtx.drawImage(blurred, 0, 0);
    maskCtx.restore();
  }

  /* -------------------- A2) Paper-tooth edge nibble (NEW) --------------------
   * Subtle, stationary micro-bites along the outer edge:
   * - Build a thin edge band with per-segment alpha (more at low pressure, tips)
   * - Gate a stationary speckle tile to that band
   * - Subtract it from the stroke mask (destination-out)
   * -------------------------------------------------------------------- */
  {
    // 1) Build a thin edge band mask (white on transparent)
    const edgeBand = document.createElement("canvas");
    edgeBand.width = maskCanvas.width;
    edgeBand.height = maskCanvas.height;
    const ex = edgeBand.getContext("2d", { alpha: true })!;
    ex.strokeStyle = "#fff";
    ex.lineCap = "round";
    ex.lineJoin = "round";

    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      const { bellyProgress, alphaProgress, midPressure, tMid } = gates[i - 1];

      // Narrow band hugging the outside boundary (thinner than the always-on rim)
      const widthScale = pressureToWidthScale(midPressure);
      const bandW =
        baseSizePx *
        widthScale *
        (0.05 * bellyProgress + 0.035) *
        widthEndSqueeze(tMid);
      ex.lineWidth = Math.max(0.6, bandW);

      // Alpha stronger at light pressure & near tips; weaker in belly
      const light = 1 - clamp01(midPressure);
      const tip = 1 - alphaProgress;
      const belly = bellyProgress;
      const segAlpha =
        0.55 * (0.65 * light + 0.35 * tip) * (0.45 + 0.55 * (1 - belly));
      ex.globalAlpha = segAlpha; // 0..~0.5

      ex.beginPath();
      ex.moveTo(a.x, a.y);
      ex.lineTo(b.x, b.y);
      ex.stroke();
    }

    // 2) Lay a stationary speckle tile and gate it to the edge band
    const toothTex = document.createElement("canvas");
    toothTex.width = maskCanvas.width;
    toothTex.height = maskCanvas.height;
    const tx = toothTex.getContext("2d", { alpha: true })!;
    tx.fillStyle = makeToothTile(rngSeed ^ 0x77cc, 28, 0.58, 0.24);
    tx.fillRect(0, 0, toothTex.width, toothTex.height);

    tx.globalCompositeOperation = "destination-in"; // keep only the band
    tx.drawImage(edgeBand, 0, 0);

    // 3) Subtract nibble texture from the stroke mask (very subtle)
    maskCtx.save();
    maskCtx.globalCompositeOperation = "destination-out";
    maskCtx.globalAlpha = 0.14; // overall strength; try 0.12–0.20
    maskCtx.drawImage(toothTex, 0, 0);
    maskCtx.restore();
  }

  // Composite stroke body
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.restore();

  /* -------------------- B) Core-only grain -------------------- */
  {
    const innerMaskCanvas = document.createElement("canvas");
    innerMaskCanvas.width = maskCanvas.width;
    innerMaskCanvas.height = maskCanvas.height;
    const innerMaskCtx = innerMaskCanvas.getContext("2d", { alpha: true })!;
    innerMaskCtx.strokeStyle = "#fff";
    innerMaskCtx.lineCap = "round";
    innerMaskCtx.lineJoin = "round";

    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      const next = samples[i];
      const { bellyProgress, alphaProgress, midPressure, tMid } = gates[i - 1];
      if (alphaProgress <= 0.001) continue;

      const widthScale = pressureToWidthScale(midPressure);
      const innerWidthPx =
        baseSizePx * widthScale * (0.32 * Math.pow(bellyProgress, 0.9) + 0.2);

      innerMaskCtx.lineWidth = Math.max(1, innerWidthPx);
      innerMaskCtx.globalAlpha = 0.75 * alphaProgress;
      innerMaskCtx.beginPath();
      innerMaskCtx.moveTo(prev.x, prev.y);
      innerMaskCtx.lineTo(next.x, next.y);
      innerMaskCtx.stroke();
    }

    const grainCanvas = document.createElement("canvas");
    grainCanvas.width = maskCanvas.width;
    grainCanvas.height = maskCanvas.height;
    const grainCtx = grainCanvas.getContext("2d", { alpha: true })!;

    const tileA = makeMultiplyTile(rngSeed ^ 0x0999, 24, 0.17);
    const tileB = makeMultiplyTile(rngSeed ^ 0x2ab3, 20, 0.14);

    grainCtx.fillStyle = tileA;
    grainCtx.fillRect(0, 0, grainCanvas.width, grainCanvas.height);
    grainCtx.globalAlpha = 0.85;
    grainCtx.fillStyle = tileB;
    grainCtx.fillRect(0, 0, grainCanvas.width, grainCanvas.height);

    grainCtx.globalCompositeOperation = "destination-in";
    grainCtx.drawImage(innerMaskCanvas, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.55;
    ctx.drawImage(grainCanvas, 0, 0);
    ctx.restore();
  }

  /* -------------------- C) Tip rim (screen) -------------------- */
  {
    const rimCanvas = document.createElement("canvas");
    rimCanvas.width = maskCanvas.width;
    rimCanvas.height = maskCanvas.height;
    const rimCtx = rimCanvas.getContext("2d", { alpha: true })!;
    rimCtx.strokeStyle = "#fff";
    rimCtx.lineCap = "round";
    rimCtx.lineJoin = "round";

    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      const next = samples[i];
      const { bellyProgress, alphaProgress, midPressure } = gates[i - 1];
      if (alphaProgress <= 0.001) continue;

      const widthScale = pressureToWidthScale(midPressure);
      rimCtx.lineWidth = Math.max(
        1,
        baseSizePx * widthScale * (0.14 * bellyProgress + 0.08)
      );
      rimCtx.globalAlpha = Math.pow(1 - alphaProgress, 0.85) * 0.12;

      rimCtx.beginPath();
      rimCtx.moveTo(prev.x, prev.y);
      rimCtx.lineTo(next.x, next.y);
      rimCtx.stroke();
    }

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.drawImage(rimCanvas, 0, 0);
    ctx.restore();
  }

  /* -------------------- D) Always-on faint rim (screen) -------------------- */
  {
    const rimAll = document.createElement("canvas");
    rimAll.width = maskCanvas.width;
    rimAll.height = maskCanvas.height;
    const rx = rimAll.getContext("2d", { alpha: true })!;
    rx.strokeStyle = "#fff";
    rx.lineCap = "round";
    rx.lineJoin = "round";

    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      const { bellyProgress, midPressure } = gates[i - 1];
      const widthScale = pressureToWidthScale(midPressure);
      rx.lineWidth = Math.max(
        0.7,
        baseSizePx * widthScale * (0.06 * bellyProgress + 0.045)
      );
      rx.globalAlpha = 0.012 * (0.55 + 0.45 * Math.sqrt(bellyProgress));
      rx.beginPath();
      rx.moveTo(a.x, a.y);
      rx.lineTo(b.x, b.y);
      rx.stroke();
    }

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.drawImage(rimAll, 0, 0);
    ctx.restore();
  }

  /* -------------------- E) Flank tooth (optional) -------------------- */
  {
    const flankMask = document.createElement("canvas");
    flankMask.width = maskCanvas.width;
    flankMask.height = maskCanvas.height;
    const fm = flankMask.getContext("2d", { alpha: true })!;
    fm.strokeStyle = "#fff";
    fm.lineCap = "round";
    fm.lineJoin = "round";

    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      const { bellyProgress, alphaProgress, midPressure, tMid } = gates[i - 1];
      if (alphaProgress <= 0.001) continue;

      const widthScale = pressureToWidthScale(midPressure);
      const flankWidth =
        baseSizePx *
        widthScale *
        (0.18 * Math.pow(bellyProgress, 0.9) + 0.08) *
        widthEndSqueeze(tMid);

      fm.lineWidth = Math.max(0.5, flankWidth);
      fm.globalAlpha = 0.5 * alphaProgress;
      fm.beginPath();
      fm.moveTo(a.x, a.y);
      fm.lineTo(b.x, b.y);
      fm.stroke();
    }

    const flankTex = document.createElement("canvas");
    flankTex.width = maskCanvas.width;
    flankTex.height = maskCanvas.height;
    const fx = flankTex.getContext("2d", { alpha: true })!;
    const tile = makeMultiplyTile(rngSeed ^ 0x33aa, 22, 0.12);
    fx.fillStyle = tile;
    fx.fillRect(0, 0, flankTex.width, flankTex.height);
    fx.globalCompositeOperation = "destination-in";
    fx.drawImage(flankMask, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.14; // whisper
    ctx.drawImage(flankTex, 0, 0);
    ctx.restore();
  }
}

export const backendId = "stamping" as const;
