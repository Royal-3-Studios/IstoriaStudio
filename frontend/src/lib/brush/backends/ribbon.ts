// FILE: src/lib/brush/backends/ribbon.ts
/**
 * Ribbon backend — continuous polygon silhouette with layered glazes & grain.
 * Profiles:
 *  - PENCIL (default): long tapers, mild rim polish, optional grain/dust.
 *  - INK/MARKER (rendering.mode === "marker"): crisper, darker, minimal blur,
 *    no tip fade/erode, grain off by default.
 *
 * IMPORTANT: The engine sizes the canvas layer and applies DPR transforms.
 *            Draw only in CSS space here; don't resize the canvas or setTransform.
 */

import type { RenderOptions } from "../engine";

/* ========================================================================== *
 * Tunables
 * ========================================================================== */

type PencilTuning = {
  bodyWidthScale: number;

  taperMin: number;
  taperMax: number;
  taperRadiusFactor: number;
  tipSharpenBoost: number;
  midBoostAmt: number;

  glazeBlurPx: number;
  glaze1Alpha: number;
  glaze2Alpha: number;
  plateAlpha: number;
  spineAlpha: number;

  opacitySpineAlpha: number;
  opacitySpineBlurK: number;
  opacitySpineWidth: number;

  rimPx: number;
  rimAlpha: number;
  sheenAlpha: number;
  edgeBandPx: number;

  grainDepthDefault: number;
  grainScaleDefault: number;
  grainAnisoX: number;
  grainAnisoY: number;

  microJitterPx: number;
  microJitterFreq: number;

  tipMinAlpha: number;

  fineDustAlphaK: number;
  fineDustScaleDiv: number;
  fineDustRotateK: number;
};

const TUNING_PENCIL: PencilTuning = {
  bodyWidthScale: 0.42,

  taperMin: 240,
  taperMax: 770,
  taperRadiusFactor: 26,
  tipSharpenBoost: 0.26,
  midBoostAmt: 0.15,

  glazeBlurPx: 0.52,
  glaze1Alpha: 0.62,
  glaze2Alpha: 0.34,
  plateAlpha: 0.16,
  spineAlpha: 0.26,

  opacitySpineAlpha: 0.4,
  opacitySpineBlurK: 0.55,
  opacitySpineWidth: 1.6,

  rimPx: 1.1,
  rimAlpha: 0.18,
  sheenAlpha: 0.1,
  edgeBandPx: 0.9,

  grainDepthDefault: 0.34,
  grainScaleDefault: 1.4,
  grainAnisoX: 0.7,
  grainAnisoY: 1.35,

  microJitterPx: 0.22,
  microJitterFreq: 0.16,

  tipMinAlpha: 0.25,

  fineDustAlphaK: 0.08,
  fineDustScaleDiv: 3.0,
  fineDustRotateK: 0.4,
};

const TUNING_INK: PencilTuning = {
  ...TUNING_PENCIL,
  bodyWidthScale: 0.52,
  midBoostAmt: 0.0,
  tipSharpenBoost: 0.18,

  glazeBlurPx: 0.28,
  glaze1Alpha: 0.42,
  glaze2Alpha: 0.28,
  plateAlpha: 0.22,
  spineAlpha: 0.55,

  opacitySpineAlpha: 0.68,
  opacitySpineBlurK: 0.42,
  opacitySpineWidth: 1.1,

  rimAlpha: 0.0,

  tipMinAlpha: 0.96,

  microJitterPx: 0.06,
  microJitterFreq: 0.12,

  grainDepthDefault: 0.0,
};

const PREVIEW_MIN_SIZE = { width: 352, height: 128 };

/* ========================================================================== *
 * Small utilities
 * ========================================================================== */

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easePowOut = (t: number): number => 1 - Math.pow(1 - clamp01(t), 2.3);

function isCanvas2DContext(ctx: unknown): ctx is Ctx2D {
  if (typeof ctx !== "object" || ctx === null) return false;
  const cand = ctx as {
    drawImage?: unknown;
    canvas?: unknown;
    setTransform?: unknown;
  };
  return (
    typeof cand.drawImage === "function" && typeof cand.canvas !== "undefined"
  );
}

/** Minimal hex parser; falls back to black on bad input. */
function hexToRGBA(hex: string | undefined, alpha: number): string {
  const a = clamp01(alpha);
  if (!hex || typeof hex !== "string") return `rgba(0,0,0,${a})`;
  const m = hex.replace("#", "");
  const parse = (s: string) => Math.max(0, Math.min(255, parseInt(s, 16) || 0));
  if (m.length === 3) {
    const r = parse(m[0] + m[0]),
      g = parse(m[1] + m[1]),
      b = parse(m[2] + m[2]);
    return `rgba(${r},${g},${b},${a})`;
  }
  const r = parse(m.slice(0, 2)),
    g = parse(m.slice(2, 4)),
    b = parse(m.slice(4, 6));
  return `rgba(${r},${g},${b},${a})`;
}

/** Tiny xorshift-like RNG returning [0,1) */
function makeSeededRng(seed: number): () => number {
  let x = seed || 123456789;
  return (): number => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  };
}

function createCanvas(
  w: number,
  h: number
): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function getCanvas2DContext(c: OffscreenCanvas | HTMLCanvasElement): Ctx2D {
  const ctx = c.getContext("2d");
  if (!isCanvas2DContext(ctx)) throw new Error("2D context not available.");
  return ctx;
}

/** Make a grayscale noise tile (used for grain/dust). */
function createNoiseTile(
  size = 64,
  seed = 1
): OffscreenCanvas | HTMLCanvasElement {
  const c = createCanvas(size, size);
  const ctx = getCanvas2DContext(c);
  const img = ctx.createImageData(size, size);
  const rnd = makeSeededRng(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (rnd() * 0.6 + rnd() * 0.4) * 255;
    img.data[i + 0] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ========================================================================== *
 * Path helpers
 * ========================================================================== */

type InputPoint = { x: number; y: number; angle?: number };
type SamplePoint = { x: number; y: number; angle: number; arcLen: number };

function createDefaultPreviewPath(width: number, height: number): InputPoint[] {
  const out: InputPoint[] = [];
  const x0 = Math.max(6, Math.floor(width * 0.06));
  const x1 = Math.min(width - 6, Math.floor(width * 0.94));
  const midY = Math.floor(height * 0.6);
  const amp = Math.max(6, Math.min(height * 0.35, 32));
  const steps = 72;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = midY - amp * t + amp * 0.45 * Math.sin(6.5 * t);
    const dx = (x1 - x0) / steps;
    const dy = -amp / steps + (amp * 0.45 * 6.5 * Math.cos(6.5 * t)) / steps;
    out.push({ x, y, angle: Math.atan2(dy, dx) });
  }
  return out;
}

/** Resample path by arc-length step; guarantees monotonically increasing arcLen. */
function resamplePathUniform(path: InputPoint[], step: number): SamplePoint[] {
  if (!path.length) return [];

  const prefix: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    prefix[i] = prefix[i - 1] + Math.hypot(dx, dy);
  }
  const totalLen = prefix[prefix.length - 1];
  if (totalLen <= 0) return [];

  const arcAt = (s: number): { x: number; y: number; angle: number } => {
    let i = 1;
    while (i < prefix.length && prefix[i] < s) i++;
    const i1 = Math.min(prefix.length - 1, Math.max(1, i));
    const s0 = prefix[i1 - 1];
    const s1 = prefix[i1];
    const t = Math.min(1, Math.max(0, (s - s0) / Math.max(1e-6, s1 - s0)));
    const a = path[i1 - 1];
    const b = path[i1];
    const x = lerp(a.x, b.x, t);
    const y = lerp(a.y, b.y, t);
    const angle =
      a.angle != null && b.angle != null
        ? lerp(a.angle, b.angle, t)
        : Math.atan2(b.y - a.y, b.x - a.x);
    return { x, y, angle };
  };

  const out: SamplePoint[] = [];
  for (let s = 0; s <= totalLen; s += step) {
    const p = arcAt(s);
    out.push({ x: p.x, y: p.y, angle: p.angle, arcLen: s });
  }
  if (out[out.length - 1]?.arcLen < totalLen) {
    const p = arcAt(totalLen);
    out.push({ x: p.x, y: p.y, angle: p.angle, arcLen: totalLen });
  }
  return out;
}

/** Construct a ribbon outline (Path2D) from samples + per-arc radius function. */
function buildRibbonOutlinePath(
  samples: SamplePoint[],
  radiusAt: (s: number) => number
): Path2D {
  const left: Array<{ x: number; y: number }> = [];
  const right: Array<{ x: number; y: number }> = [];
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    const aPrev = i > 0 ? samples[i - 1].angle : samples[i].angle;
    const aNext = i < n - 1 ? samples[i + 1].angle : samples[i].angle;
    const ang = (aPrev + aNext) * 0.5;
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    const r = Math.max(0, radiusAt(samples[i].arcLen));
    left.push({ x: samples[i].x - nx * r, y: samples[i].y - ny * r });
    right.push({ x: samples[i].x + nx * r, y: samples[i].y + ny * r });
  }
  const path = new Path2D();
  path.moveTo(left[0].x, left[0].y);
  for (let i = 1; i < n; i++) path.lineTo(left[i].x, left[i].y);
  for (let i = n - 1; i >= 0; i--) path.lineTo(right[i].x, right[i].y);
  path.closePath();
  return path;
}

/* ========================================================================== *
 * Main renderer (draw in CSS space; DPR handled by engine)
 * ========================================================================== */

export async function drawRibbonToCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opt: RenderOptions
): Promise<void> {
  const ctx = canvas.getContext("2d");
  if (!isCanvas2DContext(ctx)) throw new Error("2D context not available.");

  // Engine already normalized dimensions to integers.
  const viewW = Math.max(
    opt?.overrides?.centerlinePencil ? PREVIEW_MIN_SIZE.width : 1,
    Math.floor(opt.width)
  );
  const viewH = Math.max(
    opt?.overrides?.centerlinePencil ? PREVIEW_MIN_SIZE.height : 1,
    Math.floor(opt.height)
  );

  // DO NOT: resize canvas or set transform here; engine did that.
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const isInk = opt?.engine?.rendering?.mode === "marker";
  const TT: PencilTuning = isInk ? TUNING_INK : TUNING_PENCIL;

  const flow01 = clamp01(
    ((opt?.overrides?.flow ?? opt?.engine?.overrides?.flow ?? 100) as number) /
      100
  );
  const opacity01 = clamp01(
    ((opt?.overrides?.opacity ??
      opt?.engine?.overrides?.opacity ??
      100) as number) / 100
  );
  const coreStrengthK = clamp(
    ((opt?.overrides?.coreStrength ??
      opt?.engine?.overrides?.coreStrength ??
      300) as number) / 100,
    0.6,
    3.0
  );

  const tipScaleStart = clamp01(
    (opt?.engine?.overrides?.tipScaleStart ??
      opt?.overrides?.tipScaleStart ??
      0.85) as number
  );
  const tipScaleEnd = clamp01(
    (opt?.engine?.overrides?.tipScaleEnd ??
      opt?.overrides?.tipScaleEnd ??
      0.85) as number
  );
  const tipMinR = Math.max(
    0,
    ((opt?.engine?.overrides?.tipMinPx ??
      opt?.overrides?.tipMinPx ??
      0) as number) * 0.5
  );

  const grainKind: string =
    (opt?.overrides?.grainKind as string | undefined) ??
    (opt?.engine?.grain?.kind as string | undefined) ??
    "paper";
  const grainDepth: number = isInk
    ? 0
    : grainKind === "none"
      ? 0
      : clamp01(
          ((opt?.overrides?.grainDepth ??
            opt?.engine?.grain?.depth ??
            TT.grainDepthDefault * 100) as number) / 100
        );
  const grainScale: number =
    (opt?.overrides?.grainScale as number | undefined) ??
    (opt?.engine?.grain?.scale as number | undefined) ??
    TT.grainScaleDefault;
  const grainRotateDeg: number =
    (opt?.overrides?.grainRotate as number | undefined) ??
    (opt?.engine?.grain?.rotate as number | undefined) ??
    8;
  const grainRotateRad: number = (grainRotateDeg * Math.PI) / 180;

  const color = opt.color ?? "#000000";

  const inputRadius = Math.max(0.5, (opt.baseSizePx || 8) * 0.5);
  const baseRadius = opt?.overrides?.centerlinePencil
    ? Math.max(0.5, inputRadius * TT.bodyWidthScale)
    : inputRadius;

  const inputPath: InputPoint[] =
    opt?.path && opt.path.length > 1
      ? (opt.path as InputPoint[])
      : createDefaultPreviewPath(viewW, viewH);

  const arcStep = Math.max(0.45, baseRadius * 0.15);
  const samples: SamplePoint[] = resamplePathUniform(inputPath, arcStep);
  if (!samples.length) return;

  const totalLen = samples[samples.length - 1].arcLen;

  /** blend factor that softly keeps tips thin via start/end tapers */
  function tipBlend(tNorm: number, startAmt: number, endAmt: number): number {
    const edgeFrac = 0.42;
    const d = Math.min(tNorm, 1 - tNorm);
    const a = Math.min(1, Math.max(0, d / edgeFrac));
    const aPow = Math.pow(a, 2.7);
    const towardStart = 1 - Math.min(1, tNorm * 2);
    const towardEnd = 1 - Math.min(1, (1 - tNorm) * 2);
    const amt = startAmt * towardStart + endAmt * towardEnd;
    return 1 - amt + amt * aPow;
  }

  /** radius profile along arc length */
  const radiusAt = (s: number): number => {
    const taperDen = clamp(
      baseRadius * TT.taperRadiusFactor,
      TT.taperMin,
      TT.taperMax
    );

    const tipTStart = clamp01(s / taperDen);
    const tipTEnd = clamp01((totalLen - s) / taperDen);

    // sharper tips
    const sharpen =
      1 - TT.tipSharpenBoost * Math.pow(1 - Math.min(tipTStart, tipTEnd), 1.6);

    // mid-body gentle boost (bell)
    const u = clamp01(s / Math.max(1e-6, totalLen));
    const bell = 1 - 4 * Math.pow(u - 0.5, 2);
    const midBoost = 1 + TT.midBoostAmt * Math.pow(Math.max(0, bell), 1.2);

    // soft tip blending from overrides
    const blend = tipBlend(u, tipScaleStart, tipScaleEnd);

    const r =
      baseRadius *
      clamp01(easePowOut(Math.min(tipTStart, tipTEnd)) * sharpen) *
      midBoost *
      blend;

    return Math.max(tipMinR, r);
  };

  const computeMicroJitter = (
    s: number,
    angle: number
  ): { ox: number; oy: number } => {
    const tip = Math.min(
      s / clamp(baseRadius * TT.taperRadiusFactor, TT.taperMin, TT.taperMax),
      (totalLen - s) /
        clamp(baseRadius * TT.taperRadiusFactor, TT.taperMin, TT.taperMax)
    );
    const fadeTowardTips = clamp01(1 - tip * 1.5);
    const u = clamp01(s / Math.max(1e-6, totalLen));
    const bell = 1 - 4 * Math.pow(u - 0.5, 2);
    const amplitude = TT.microJitterPx * fadeTowardTips * (0.7 + 0.3 * bell);
    const j = amplitude * Math.sin(s * TT.microJitterFreq);
    return { ox: Math.cos(angle) * j, oy: Math.sin(angle) * j };
  };

  const ribbonPath: Path2D = buildRibbonOutlinePath(samples, radiusAt);
  ctx.save();
  ctx.clip(ribbonPath);

  /* 1) Base fill */
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = opacity01 * (isInk ? 0.86 : 0.62) * flow01;
  (ctx as CanvasRenderingContext2D).fillStyle = hexToRGBA(
    color,
    ctx.globalAlpha
  );
  ctx.fill(ribbonPath, "nonzero");

  /* 2) Opacity spine */
  {
    const meanR = baseRadius * 0.95;
    const blurPx = Math.max(
      0.6,
      TUNING_PENCIL.glazeBlurPx * TT.opacitySpineBlurK
    );
    (ctx as CanvasRenderingContext2D).filter = `blur(${blurPx}px)`;
    ctx.globalAlpha = clamp01(opacity01 * TT.opacitySpineAlpha * coreStrengthK);
    (ctx as CanvasRenderingContext2D).strokeStyle = hexToRGBA(
      color,
      ctx.globalAlpha
    );
    (ctx as CanvasRenderingContext2D).lineCap = "round";
    (ctx as CanvasRenderingContext2D).lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const j = computeMicroJitter(s.arcLen, s.angle);
      if (i === 0) ctx.moveTo(s.x + j.ox, s.y + j.oy);
      else ctx.lineTo(s.x + j.ox, s.y + j.oy);
    }
    (ctx as CanvasRenderingContext2D).lineWidth = Math.max(
      1,
      meanR * TT.opacitySpineWidth
    );
    ctx.stroke();
    (ctx as CanvasRenderingContext2D).filter = "none";
  }

  /* 3) Plate (multiply) */
  ctx.globalCompositeOperation = "multiply";
  {
    const meanR = baseRadius * 0.95;
    const plateWidth = Math.max(1.0, meanR * (isInk ? 1.5 : 1.96));
    (ctx as CanvasRenderingContext2D).filter =
      `blur(${Math.max(0.6, TT.glazeBlurPx * (isInk ? 0.9 : 1.15)).toFixed(3)}px)`;
    ctx.globalAlpha = clamp01(opacity01 * TT.plateAlpha * coreStrengthK);
    (ctx as CanvasRenderingContext2D).strokeStyle = hexToRGBA(
      color,
      ctx.globalAlpha
    );
    (ctx as CanvasRenderingContext2D).lineCap = "round";
    (ctx as CanvasRenderingContext2D).lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const j = computeMicroJitter(s.arcLen, s.angle);
      if (i === 0) ctx.moveTo(s.x + j.ox, s.y + j.oy);
      else ctx.lineTo(s.x + j.ox, s.y + j.oy);
    }
    (ctx as CanvasRenderingContext2D).lineWidth = Math.max(1, plateWidth);
    ctx.stroke();
    (ctx as CanvasRenderingContext2D).filter = "none";
  }

  /* 4) Two glazes (multiply) */
  ctx.globalCompositeOperation = "multiply";
  (ctx as CanvasRenderingContext2D).filter =
    `blur(${Math.max(0.6, TT.glazeBlurPx).toFixed(3)}px)`;
  {
    const meanR = baseRadius * 0.95;

    ctx.globalAlpha = clamp01(opacity01 * TT.glaze1Alpha * coreStrengthK);
    (ctx as CanvasRenderingContext2D).strokeStyle = hexToRGBA(
      color,
      ctx.globalAlpha
    );
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const j = computeMicroJitter(s.arcLen, s.angle);
      if (i === 0) ctx.moveTo(s.x + j.ox, s.y + j.oy);
      else ctx.lineTo(s.x + j.ox, s.y + j.oy);
    }
    (ctx as CanvasRenderingContext2D).lineWidth = Math.max(
      1,
      meanR * (isInk ? 1.1 : 1.34)
    );
    ctx.stroke();

    ctx.globalAlpha = clamp01(opacity01 * TT.glaze2Alpha * coreStrengthK);
    (ctx as CanvasRenderingContext2D).strokeStyle = hexToRGBA(
      color,
      ctx.globalAlpha
    );
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const j = computeMicroJitter(s.arcLen, s.angle);
      if (i === 0) ctx.moveTo(s.x + j.ox, s.y + j.oy);
      else ctx.lineTo(s.x + j.ox, s.y + j.oy);
    }
    (ctx as CanvasRenderingContext2D).lineWidth = Math.max(
      1,
      meanR * (isInk ? 1.25 : 1.58)
    );
    ctx.stroke();
  }
  (ctx as CanvasRenderingContext2D).filter = "none";

  /* 5) Spine glaze */
  ctx.globalCompositeOperation = "multiply";
  {
    const meanR = baseRadius * 0.95;
    ctx.globalAlpha = clamp01(opacity01 * TT.spineAlpha * coreStrengthK);
    (ctx as CanvasRenderingContext2D).strokeStyle = hexToRGBA(
      color,
      ctx.globalAlpha
    );
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const j = computeMicroJitter(s.arcLen, s.angle);
      if (i === 0) ctx.moveTo(s.x + j.ox, s.y + j.oy);
      else ctx.lineTo(s.x + j.ox, s.y + j.oy);
    }
    (ctx as CanvasRenderingContext2D).lineWidth = Math.max(
      1,
      meanR * (isInk ? 0.9 : 0.96)
    );
    ctx.stroke();
  }

  /* 6) Light tip fade — pencils only */
  if (!isInk) {
    const first = samples[0];
    const last = samples[samples.length - 1];
    ctx.globalCompositeOperation = "destination-in";
    const tipFade = (ctx as CanvasRenderingContext2D).createLinearGradient(
      first.x,
      first.y,
      last.x,
      last.y
    );
    tipFade.addColorStop(
      0.0,
      `rgba(0,0,0,${TUNING_PENCIL.tipMinAlpha.toFixed(2)})`
    );
    tipFade.addColorStop(0.08, "rgba(0,0,0,1.0)");
    tipFade.addColorStop(0.92, "rgba(0,0,0,1.0)");
    tipFade.addColorStop(
      1.0,
      `rgba(0,0,0,${TUNING_PENCIL.tipMinAlpha.toFixed(2)})`
    );
    (ctx as CanvasRenderingContext2D).fillStyle = tipFade;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.globalCompositeOperation = "source-over";
  }

  /* 7) Inner rim polish — pencils only */
  if (!isInk && TUNING_PENCIL.rimAlpha > 0.01) {
    ctx.globalCompositeOperation = "destination-out";
    (ctx as CanvasRenderingContext2D).filter = "blur(0.35px)";
    (ctx as CanvasRenderingContext2D).strokeStyle = "rgba(0,0,0,0.18)";
    (ctx as CanvasRenderingContext2D).lineCap = "round";
    (ctx as CanvasRenderingContext2D).lineJoin = "round";
    (ctx as CanvasRenderingContext2D).lineWidth = 0.7;
    ctx.stroke(ribbonPath);
    (ctx as CanvasRenderingContext2D).filter = "none";
    ctx.globalCompositeOperation = "source-over";
  }

  /* 8) Grain & fine dust (multiply) — disabled for ink */
  if (!isInk && grainDepth > 0.001) {
    const seed: number = (opt.seed ?? 7) % 997;
    const grainTile = createNoiseTile(64, 31 * seed + 7);
    const first = samples[0];
    const last = samples[samples.length - 1];

    // 8a) Multiply grain
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.translate(first.x, first.y);
    ctx.rotate(grainRotateRad);
    ctx.scale(TUNING_PENCIL.grainAnisoX, TUNING_PENCIL.grainAnisoY);
    const grainExtent = Math.max(
      32,
      Math.ceil((viewW + viewH) / Math.max(0.5, grainScale))
    );
    ctx.globalAlpha = opacity01 * grainDepth * 0.22;
    ctx.drawImage(
      grainTile as CanvasImageSource,
      -grainExtent / 2,
      -grainExtent / 2,
      grainExtent,
      grainExtent
    );
    ctx.restore();

    // 8b) Restrict grain to a slightly narrower core band.
    ctx.globalCompositeOperation = "destination-in";
    const meanR = baseRadius * 0.95;
    (ctx as CanvasRenderingContext2D).strokeStyle = "rgba(0,0,0,1)";
    (ctx as CanvasRenderingContext2D).lineCap = "round";
    (ctx as CanvasRenderingContext2D).lineJoin = "round";
    (ctx as CanvasRenderingContext2D).lineWidth = Math.max(0.8, meanR * 1.24);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < samples.length; i++)
      ctx.lineTo(samples[i].x, samples[i].y);
    ctx.stroke();

    ctx.globalCompositeOperation = "source-over";

    // 8c) Fine dust
    const dustTile = createNoiseTile(32, 101 * seed + 13);
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.translate(first.x, first.y);
    ctx.rotate(grainRotateRad * TUNING_PENCIL.fineDustRotateK);
    ctx.scale(1.08, 1.08);
    const dustExtent = Math.max(
      16,
      Math.ceil((viewW + viewH) / TUNING_PENCIL.fineDustScaleDiv)
    );
    ctx.globalAlpha = opacity01 * grainDepth * TUNING_PENCIL.fineDustAlphaK;
    ctx.drawImage(
      dustTile as CanvasImageSource,
      -dustExtent / 2,
      -dustExtent / 2,
      dustExtent,
      dustExtent
    );
    ctx.restore();

    // 8d) Fade dust toward tips and keep it within the core band
    ctx.globalCompositeOperation = "destination-in";
    const dustFade = (ctx as CanvasRenderingContext2D).createLinearGradient(
      first.x,
      first.y,
      last.x,
      last.y
    );
    dustFade.addColorStop(0.0, "rgba(0,0,0,0.50)");
    dustFade.addColorStop(0.5, "rgba(0,0,0,1.00)");
    dustFade.addColorStop(1.0, "rgba(0,0,0,0.50)");
    (ctx as CanvasRenderingContext2D).fillStyle = dustFade;
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.globalCompositeOperation = "destination-in";
    (ctx as CanvasRenderingContext2D).strokeStyle = "rgba(0,0,0,1)";
    (ctx as CanvasRenderingContext2D).lineWidth = Math.max(
      0.7,
      baseRadius * 1.16
    );
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < samples.length; i++)
      ctx.lineTo(samples[i].x, samples[i].y);
    ctx.stroke();

    ctx.globalCompositeOperation = "source-over";
  }

  ctx.restore(); // clip
}

export default drawRibbonToCanvas;
