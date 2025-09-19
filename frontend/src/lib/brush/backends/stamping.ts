// FILE: src/lib/brush/backends/stamping.ts
/**
 * Graphite & Charcoal — Stamping v34 + Split Nibs
 * - Preserves the look you reverted to (v34)
 * - Adds optional multi-track “split nibs” layout controlled via overrides:
 *    splitCount: 1..16
 *    splitSpacing: px between tracks
 *    splitSpacingJitter: 0..100 (% of spacing, per track)
 *    splitCurvature: -1..+1 (fan bend along the stroke)
 *    splitAsymmetry: -1..+1 (bias tracks to one side)
 *    splitScatter: px random normal scatter (per segment)
 *    splitAngle: base fan rotation in degrees
 *    pressureToSplitSpacing: 0..1 (pressure widens/narrows the fan)
 *    tiltToSplitFan: deg (tilt widens the fan; ignored if no tilt)
 *
 * Notes
 * - Defaults keep behavior identical to v34 (single track).
 * - All passes (body, spine, gates, rim) respect the split layout.
 */

import type {
  RenderOptions,
  RenderOverrides,
  RenderPathPoint,
} from "@/lib/brush/engine";

/* ============================== Math & RNG =============================== */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

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

/* ============================== Tiles =================================== */

function clampTileSizePx(sz: number | undefined, min = 2, max = 512) {
  const n = Number.isFinite(sz as number) ? Math.floor(sz as number) : 0;
  return Math.max(min, Math.min(max, n));
}

/** Near-white speckle for multiply compositing (graphite sheen). */
function makeMultiplyTile(seed: number, size = 24, alpha = 0.16) {
  const rand = makeRng(seed ^ 0x5151);
  const c = document.createElement("canvas");
  c.width = c.height = Math.max(2, Math.floor(size));
  const x = c.getContext("2d")!;
  const img = x.createImageData(c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 215 + rand() * 40;
    img.data[i + 0] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = Math.round(255 * alpha);
  }
  x.putImageData(img, 0, 0);
  return x.createPattern(c, "repeat")!;
}

/** Soft alpha noise used to subtly vary hole density along stroke. */
function makeAlphaNoiseTile(
  seed: number,
  size = 28,
  bias = 0.6,
  contrast = 1.0
) {
  const rand = makeRng(seed ^ 0xa11a);
  const c = document.createElement("canvas");
  c.width = c.height = clampTileSizePx(size);
  const x = c.getContext("2d")!;
  const img = x.createImageData(c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) {
    let v = rand();
    v = Math.pow(v, contrast);
    const a = Math.max(0, Math.min(1, (v - (1 - bias)) / bias));
    img.data[i + 0] = 0;
    img.data[i + 1] = 0;
    img.data[i + 2] = 0;
    img.data[i + 3] = Math.round(255 * a);
  }
  x.putImageData(img, 0, 0);
  return x.createPattern(c, "repeat")!;
}

/** Opaque dot tile for hard paper-tooth cutouts (destination-out). */
function makeHoleDotTile(
  seed: number,
  sizePx: number,
  density = 0.14, // 0..~0.4
  rMin = 0.45,
  rMax = 1.25
): CanvasPattern {
  const size = clampTileSizePx(sizePx);
  const rnd = makeRng(seed ^ 0x6b6b);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const x = c.getContext("2d", { alpha: true })!;
  x.clearRect(0, 0, size, size);

  const avgR = (rMin + rMax) * 0.5;
  const dots = Math.max(
    1,
    Math.round((size * size * density) / (Math.PI * avgR * avgR))
  );

  x.fillStyle = "#fff";
  for (let i = 0; i < dots; i++) {
    const r = rMin + rnd() * (rMax - rMin);
    const px = (rnd() * size) | 0;
    const py = (rnd() * size) | 0;
    x.beginPath();
    x.arc(px + 0.5, py + 0.5, r, 0, Math.PI * 2);
    x.fill();
  }
  return x.createPattern(c, "repeat")!;
}

/** Fill with a pattern but randomize the phase so tiling seams don’t align. */
function fillPatternWithRandomPhase(
  ctx: CanvasRenderingContext2D,
  pat: CanvasPattern,
  w: number,
  h: number,
  rand: () => number
) {
  const ox = Math.floor((rand() - 0.5) * 128);
  const oy = Math.floor((rand() - 0.5) * 128);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.fillStyle = pat;
  ctx.fillRect(-ox, -oy, w + Math.abs(ox) * 2, h + Math.abs(oy) * 2);
  ctx.restore();
}

/* ============================== Spacing & Taper =========================== */

function resolveSpacingFraction(uiSpacing?: number, fallbackPct = 3): number {
  const raw = typeof uiSpacing === "number" ? uiSpacing : fallbackPct;
  const frac = raw > 1 ? raw / 100 : raw;
  return Math.max(0.02, Math.min(0.08, frac));
}

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

const TIP_CULL_RADIUS_PX = 0;

/* ---- tip/body shaping helpers ------------------------------------------ */

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

/* ============================== Pressure Maps ============================ */

function pressureToWidthScale(p01: number) {
  const q = Math.pow(clamp01(p01), 0.65);
  return 0.85 + q * 0.45;
}
function pressureToFlowScale(p01: number) {
  const q = Math.pow(clamp01(p01), 1.15);
  return 0.4 + q * 0.6;
}

/* ============================== Resampling =============================== */

type SamplePoint = { x: number; y: number; t: number; p: number };

function resamplePath(
  points: RenderPathPoint[],
  stepPx: number
): SamplePoint[] {
  const out: SamplePoint[] = [];
  if (!points || points.length < 2) return out;

  const N = points.length;
  const segLen = new Array<number>(N).fill(0);
  let total = 0;
  for (let i = 1; i < N; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const L = Math.hypot(dx, dy);
    segLen[i] = L;
    total += L;
  }
  if (total <= 0) return out;

  const prefix = new Array<number>(N).fill(0);
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

/* ============================== Geometry helpers ======================== */

function segmentNormal(ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  return { nx, ny };
}

/* ============================== Render ================================== */

export default function drawStamping(
  ctx: CanvasRenderingContext2D,
  options: RenderOptions
) {
  const pts = options.path ?? [];
  if (pts.length < 2) return;

  const overrides = (options.engine.overrides ??
    {}) as Required<RenderOverrides>;
  const baseFlow01 = clamp01((overrides.flow ?? 64) / 100);

  const baseSizePx = Math.max(
    1,
    options.baseSizePx * (options.engine.shape?.sizeScale ?? 1)
  );

  const seed = (options.seed ?? 42) & 0xffffffff;
  const rand = makeRng(seed ^ 0x1234);

  // honor UI spacing
  const uiSpacing =
    options.engine.strokePath?.spacing ?? options.engine.overrides?.spacing;
  const spacingFrac = resolveSpacingFraction(uiSpacing, 3);
  const resampleStepPx = Math.max(
    0.3,
    Math.min(0.75, baseSizePx * spacingFrac)
  );

  const samples = resamplePath(pts, resampleStepPx);
  if (samples.length < 2) return;

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
  const grainKind = options.engine.grain?.kind;
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

  // NEW: Split nibs (all default-neutral)
  const splitCount = Math.max(1, Math.round(overrides.splitCount ?? 1));
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
  const tiltToSplitFan = (overrides.tiltToSplitFan ?? 0) * (Math.PI / 180);

  // We don't compute speed in v34; speed dynamics defaults are neutral anyway.

  const ovAny = overrides as unknown as {
    toothBody?: number;
    toothFlank?: number;
    toothScale?: number;
    rimMode?: "auto" | "on" | "off";
    rimStrength?: number;
    bgIsLight?: boolean;
  };

  /* -------------------- A) Stroke mask -------------------- */
  const mask = document.createElement("canvas");
  mask.width = Math.max(1, Math.floor(options.width));
  mask.height = Math.max(1, Math.floor(options.height));
  const mx = mask.getContext("2d", { alpha: true })!;
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
      jit: () => number
    ) => void
  ) {
    // Segment normal:
    const { nx, ny } = segmentNormal(ax, ay, bx, by);

    // Fan angle from overrides (tiltToSplitFan uses point tilt if provided; ignored here)
    const fanAngle = splitAngle + tiltToSplitFan * 0; // tilt is not threaded in v34 path

    // Rotate normal by fan angle
    const rx = Math.cos(fanAngle) * nx - Math.sin(fanAngle) * ny;
    const ry = Math.sin(fanAngle) * nx + Math.cos(fanAngle) * ny;

    for (let k = 0; k < splitCount; k++) {
      const trackIndex = k;
      const r = makeRng((seed ^ 0x1000) + k * 97);

      const center = (splitCount - 1) / 2;
      const baseSep = splitSpacing * (trackIndex - center);
      const jittered = baseSep * (1 + (r() * 2 - 1) * splitSpacingJitter);

      const pressSep = 1 + pressureToSplitSpacing * ((pMid - 0.5) * 2);
      const curve = 1 + splitCurvature * (2 * tMid - 1);
      const asym = 1 + splitAsymmetry * ((trackIndex - center) / (center || 1));

      const sep = jittered * pressSep * curve * asym;

      // random small scatter orthogonal to path
      const sc = splitScatter > 0 ? (r() * 2 - 1) * splitScatter : 0;

      const ox = rx * sep + nx * sc;
      const oy = ry * sep + ny * sc;

      cb(ax + ox, ay + oy, bx + ox, by + oy, r);
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

    // taper shaping
    widthPx *= tipBlend(tMid, tipStart, tipEnd);
    widthPx = applyEndBias(widthPx, tMid, endBias);
    widthPx = applyUniformity(widthPx, bellyProgress, uniformity);
    if (tipMinPx > 0) widthPx = Math.max(widthPx, tipMinPx);

    if (0.5 * widthPx < TIP_CULL_RADIUS_PX) continue;

    mx.lineWidth = Math.max(0.5, widthPx);
    mx.globalAlpha =
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

  // Pass 2 — narrow spine
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

  // Edge carve: remove faint halo
  {
    const blurred = document.createElement("canvas");
    blurred.width = mask.width;
    blurred.height = mask.height;
    const bx = blurred.getContext("2d", { alpha: true })!;
    bx.filter = "blur(0.40px)";
    bx.drawImage(mask, 0, 0);
    bx.filter = "none";
    bx.globalCompositeOperation = "destination-out";
    bx.drawImage(mask, 0, 0);

    mx.save();
    mx.globalCompositeOperation = "destination-out";
    mx.globalAlpha = 0.26;
    mx.drawImage(blurred, 0, 0);
    mx.restore();
  }

  /* ---- Paper tooth perforation (multi-scale + random phase) ---- */
  {
    const effectiveTile = clampTileSizePx(
      (ovAny?.toothScale && ovAny.toothScale > 1
        ? ovAny.toothScale
        : Math.round(baseSizePx * (isCharcoal ? 1.6 : 1.35))) as number
    );

    const bodyDensity = isCharcoal ? 0.22 : 0.12;
    const flankDensity = isCharcoal ? 0.34 : 0.18;

    const bodyDepth = clamp01(ovAny?.toothBody ?? (isCharcoal ? 0.75 : 0.55));
    const flankDepth = clamp01(ovAny?.toothFlank ?? (isCharcoal ? 1.0 : 0.85));

    const noiseTile = makeAlphaNoiseTile(
      seed ^ 0x77aa,
      effectiveTile * 0.9,
      0.6,
      1
    );

    // Build gates
    const bodyGate = document.createElement("canvas");
    bodyGate.width = mask.width;
    bodyGate.height = mask.height;
    const bg = bodyGate.getContext("2d", { alpha: true })!;
    bg.strokeStyle = "#fff";
    bg.lineCap = "round";
    bg.lineJoin = "round";

    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      const { bellyProgress, alphaProgress, midPressure, tMid } = gates[i - 1];
      if (alphaProgress <= 0.001) continue;

      const wScale = pressureToWidthScale(midPressure);
      const innerW =
        baseSizePx *
        wScale *
        (0.26 * Math.pow(bellyProgress, 0.9) + 0.18) *
        widthEndSqueeze(tMid);

      bg.lineWidth = Math.max(0.75, innerW);
      const centerEase = mix(0.7, 0.4, 1 - bodyDepth);
      bg.globalAlpha = alphaProgress * centerEase;

      forEachTrack(tMid, midPressure, a.x, a.y, b.x, b.y, (ax, ay, bx, by) => {
        bg.beginPath();
        bg.moveTo(ax, ay);
        bg.lineTo(bx, by);
        bg.stroke();
      });
    }

    const flankGate = document.createElement("canvas");
    flankGate.width = mask.width;
    flankGate.height = mask.height;
    const fg = flankGate.getContext("2d", { alpha: true })!;
    fg.strokeStyle = "#fff";
    fg.lineCap = "round";
    fg.lineJoin = "round";

    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      const { bellyProgress, alphaProgress, midPressure, tMid } = gates[i - 1];
      if (alphaProgress <= 0.001) continue;

      const wScale = pressureToWidthScale(midPressure);
      const flankW =
        baseSizePx *
        wScale *
        (0.22 * Math.pow(bellyProgress, 0.9) + 0.1) *
        widthEndSqueeze(tMid);

      fg.lineWidth = Math.max(0.5, flankW);
      fg.globalAlpha = 0.8 * alphaProgress;

      forEachTrack(tMid, midPressure, a.x, a.y, b.x, b.y, (ax, ay, bx, by) => {
        fg.beginPath();
        fg.moveTo(ax, ay);
        fg.lineTo(bx, by);
        fg.stroke();
      });
    }

    // Body holes canvas (two passes)
    const bodyHoles = document.createElement("canvas");
    bodyHoles.width = mask.width;
    bodyHoles.height = mask.height;
    const bhx = bodyHoles.getContext("2d", { alpha: true })!;

    const bodyTileA = makeHoleDotTile(
      seed ^ 0x1144,
      effectiveTile,
      bodyDensity
    );
    const bodyTileB = makeHoleDotTile(
      seed ^ 0x3344,
      Math.max(2, Math.round(effectiveTile * 0.62)),
      bodyDensity * 0.75
    );

    fillPatternWithRandomPhase(
      bhx,
      bodyTileA,
      bodyHoles.width,
      bodyHoles.height,
      rand
    );
    bhx.globalAlpha = 0.7;
    fillPatternWithRandomPhase(
      bhx,
      bodyTileB,
      bodyHoles.width,
      bodyHoles.height,
      rand
    );
    bhx.globalAlpha = 1;

    bhx.globalCompositeOperation = "destination-in";
    bhx.fillStyle = noiseTile;
    bhx.fillRect(0, 0, bodyHoles.width, bodyHoles.height);
    bhx.drawImage(bodyGate, 0, 0);

    mx.save();
    mx.globalCompositeOperation = "destination-out";
    mx.globalAlpha = bodyDepth;
    mx.drawImage(bodyHoles, 0, 0);
    mx.restore();

    // Flank holes
    const flankHoles = document.createElement("canvas");
    flankHoles.width = mask.width;
    flankHoles.height = mask.height;
    const fhx = flankHoles.getContext("2d", { alpha: true })!;

    const flankTileA = makeHoleDotTile(
      seed ^ 0x2288,
      effectiveTile,
      flankDensity
    );
    const flankTileB = makeHoleDotTile(
      seed ^ 0x5588,
      Math.max(2, Math.round(effectiveTile * 0.7)),
      flankDensity * 0.85
    );

    fillPatternWithRandomPhase(
      fhx,
      flankTileA,
      flankHoles.width,
      flankHoles.height,
      rand
    );
    fhx.globalAlpha = 0.75;
    fillPatternWithRandomPhase(
      fhx,
      flankTileB,
      flankHoles.width,
      flankHoles.height,
      rand
    );
    fhx.globalAlpha = 1;

    fhx.globalCompositeOperation = "destination-in";
    fhx.drawImage(flankGate, 0, 0);

    mx.save();
    mx.globalCompositeOperation = "destination-out";
    mx.globalAlpha = flankDepth;
    mx.drawImage(fhx.canvas, 0, 0);
    mx.restore();
  }

  /* -------------------- B) Composite mask into destination ---------------- */
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(mask, 0, 0);
  ctx.restore();

  /* -------------------- C) Inner-belly grain (respects holes) ------------- */
  {
    const inner = document.createElement("canvas");
    inner.width = mask.width;
    inner.height = mask.height;
    const ix = inner.getContext("2d", { alpha: true })!;
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

    const grain = document.createElement("canvas");
    grain.width = mask.width;
    grain.height = mask.height;
    const gx = grain.getContext("2d", { alpha: true })!;

    const tileA = makeMultiplyTile(seed ^ 0x0999, 24, 0.17);
    const tileB = makeMultiplyTile(seed ^ 0x2ab3, 20, 0.14);

    gx.fillStyle = tileA;
    gx.fillRect(0, 0, grain.width, grain.height);
    gx.globalAlpha = 0.85;
    gx.fillStyle = tileB;
    gx.fillRect(0, 0, grain.width, grain.height);

    gx.globalCompositeOperation = "destination-in";
    gx.drawImage(inner, 0, 0);
    gx.drawImage(mask, 0, 0); // respects perforations

    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.55;
    ctx.drawImage(grain, 0, 0);
    ctx.restore();
  }

  /* -------------------- D) Tip rim (screen, pencils only) ----------------- */
  {
    const rimMode = (ovAny?.rimMode ?? "auto") as "auto" | "on" | "off";
    const useRim = rimMode === "on" || (rimMode === "auto" && !isCharcoal);
    if (useRim) {
      const rim = document.createElement("canvas");
      rim.width = mask.width;
      rim.height = mask.height;
      const rx = rim.getContext("2d", { alpha: true })!;
      rx.strokeStyle = "#fff";
      rx.lineCap = "round";
      rx.lineJoin = "round";

      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1];
        const b = samples[i];
        const { bellyProgress, alphaProgress, midPressure, tMid } =
          gates[i - 1];
        if (alphaProgress <= 0.001) continue;

        rx.lineWidth = Math.max(
          1,
          baseSizePx *
            pressureToWidthScale(midPressure) *
            (0.14 * bellyProgress + 0.08)
        );
        const rimStrength = ovAny?.rimStrength ?? 0.12;
        rx.globalAlpha = Math.pow(1 - alphaProgress, 0.85) * rimStrength;

        forEachTrack(
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

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.drawImage(rim, 0, 0);
      ctx.restore();
    }
  }
}

export const backendId = "stamping" as const;
