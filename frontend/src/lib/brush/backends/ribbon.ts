// FILE: src/lib/brush/backends/ribbon.ts
/**
 * Ribbon backend — continuous polygon silhouette with layered glazes & grain.
 * Produces a strong 6B-pencil look (no stamping): long tapers, dark core,
 * subtle rim clean-up, and controllable grain/dust overlays.
 *
 * Key ideas
 * - Build a ribbon (polygon) from a resampled path and a radius function.
 * - Paint interior with layered "glazes" and a concentrated opacity spine.
 * - Multiply grain and fine dust, masked to the core and faded at tips.
 * - Light tip fade and tiny inner erode pass to polish the rim.
 *
 * Notes
 * - Honors engine overrides like: centerlinePencil, flow, coreStrength,
 *   grainKind/scale/depth/rotate, pixelRatio, etc.
 * - Enforces a minimum preview size when `centerlinePencil` is true
 *   (to stabilize the thumbnail aesthetic).
 */

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

import type { RenderOptions } from "../engine";

/* ========================================================================== *
 * Tunables
 * ========================================================================== */

type PencilTuning = {
  // geometry / shaping
  bodyWidthScale: number;
  taperMin: number;
  taperMax: number;
  taperRadiusFactor: number;
  tipSharpenBoost: number;
  midBoostAmt: number;

  // glazing & core
  glazeBlurPx: number;
  glaze1Alpha: number;
  glaze2Alpha: number;
  plateAlpha: number;
  spineAlpha: number;

  // opacity spine (soft center darkening)
  opacitySpineAlpha: number;
  opacitySpineBlurK: number;
  opacitySpineWidth: number;

  // rim / polish
  rimPx: number;
  rimAlpha: number;
  sheenAlpha: number;
  edgeBandPx: number;

  // grain defaults
  grainDepthDefault: number; // 0..1 meaning
  grainScaleDefault: number; // larger => coarser
  grainAnisoX: number;
  grainAnisoY: number;

  // micro jitter (microscopic wiggle along direction of travel)
  microJitterPx: number;
  microJitterFreq: number;

  // tip treatment
  tipMinAlpha: number;

  // fine dust overlay
  fineDustAlphaK: number; // scales by grainDepth
  fineDustScaleDiv: number; // larger => finer speckle
  fineDustRotateK: number; // slight rotation vs grain
};

const TUNING: PencilTuning = {
  // geometry / shaping
  bodyWidthScale: 0.42,
  taperMin: 240,
  taperMax: 770,
  taperRadiusFactor: 26,
  tipSharpenBoost: 0.26,
  midBoostAmt: 0.15,

  // glazing & core
  glazeBlurPx: 0.52,
  glaze1Alpha: 0.62,
  glaze2Alpha: 0.34,
  plateAlpha: 0.16,
  spineAlpha: 0.26,

  // opacity spine
  opacitySpineAlpha: 0.4,
  opacitySpineBlurK: 0.55,
  opacitySpineWidth: 1.6,

  // rim / polish
  rimPx: 1.1,
  rimAlpha: 0.18,
  sheenAlpha: 0.1,
  edgeBandPx: 0.9,

  // grain defaults
  grainDepthDefault: 0.34,
  grainScaleDefault: 1.4,
  grainAnisoX: 0.7,
  grainAnisoY: 1.35,

  // micro jitter
  microJitterPx: 0.22,
  microJitterFreq: 0.16,

  // tip treatment
  tipMinAlpha: 0.25,

  // fine dust overlay
  fineDustAlphaK: 0.08,
  fineDustScaleDiv: 3.0,
  fineDustRotateK: 0.4,
};

const PREVIEW_MIN_SIZE = { width: 352, height: 128 };

/* ========================================================================== *
 * Small utilities
 * ========================================================================== */

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easePowOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 2.3);

/** Tiny xorshift-like RNG returning [0,1) */
function makeSeededRng(seed: number) {
  let x = seed || 123456789;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  };
}

/** Create an offscreen canvas (or DOM canvas) with given size. */
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

/** Runtime check that a value is a 2D canvas context (HTML or Offscreen). */
function isCanvas2DContext(ctx: unknown): ctx is Ctx2D {
  if (typeof ctx !== "object" || ctx === null) return false;

  // We only probe for the minimal surface we rely on at runtime.
  const cand = ctx as { drawImage?: unknown; canvas?: unknown };
  const hasDrawImage = typeof cand.drawImage === "function";
  const hasCanvasRef = typeof cand.canvas !== "undefined";
  return hasDrawImage && hasCanvasRef;
}

/** Get a 2D drawing context or throw (typed as union Ctx2D). */
function getCanvas2DContext(c: OffscreenCanvas | HTMLCanvasElement): Ctx2D {
  // The DOM typings don’t unify these overloads; assert to the union we guard.
  const ctx = c.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!isCanvas2DContext(ctx)) throw new Error("2D context not available.");
  return ctx;
}

/** Make a grayscale noise tile (used for grain/dust). */
function createNoiseTile(size = 64, seed = 1) {
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

/** Default preview path (gentle arc with a small wave) */
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

  const out: SamplePoint[] = [];
  const arcAt = (s: number) => {
    let i = 1;
    while (i < prefix.length && prefix[i] < s) i++;
    const i1 = Math.min(prefix.length - 1, Math.max(1, i));
    const s0 = prefix[i1 - 1],
      s1 = prefix[i1];
    const t = Math.min(1, Math.max(0, (s - s0) / Math.max(1e-6, s1 - s0)));
    const a = path[i1 - 1],
      b = path[i1];
    const x = lerp(a.x, b.x, t);
    const y = lerp(a.y, b.y, t);
    const angle =
      a.angle != null && b.angle != null
        ? lerp(a.angle, b.angle, t)
        : Math.atan2(b.y - a.y, b.x - a.x);
    return { x, y, angle };
  };

  for (let s = 0; s <= totalLen; s += step) {
    const p = arcAt(s);
    out.push({ x: p.x, y: p.y, angle: p.angle, arcLen: s });
  }
  // ensure last sample hits the end
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
 * Main renderer
 * ========================================================================== */

export async function drawRibbonToCanvas(
  canvas: HTMLCanvasElement,
  opt: RenderOptions
): Promise<void> {
  // Resolve DPR (cap slightly for stability) and set canvas backing size.
  const dpr =
    typeof window !== "undefined"
      ? Math.min(opt.pixelRatio ?? window.devicePixelRatio ?? 1, 2)
      : Math.max(1, opt.pixelRatio ?? 1);

  // Stabilizers for low DPR to avoid sub-pixel fuzz
  const IS_LOW_DPR = dpr <= 1.05;
  const MIN_BLUR = IS_LOW_DPR ? 0.9 : 0.6;
  const MIN_STROKE_PX = IS_LOW_DPR ? 1.0 : 0.8;

  const requirePreviewMin = !!opt.overrides?.centerlinePencil;
  const viewW = Math.max(
    requirePreviewMin ? PREVIEW_MIN_SIZE.width : 1,
    Math.floor(opt.width)
  );
  const viewH = Math.max(
    requirePreviewMin ? PREVIEW_MIN_SIZE.height : 1,
    Math.floor(opt.height)
  );

  if (
    typeof HTMLCanvasElement !== "undefined" &&
    canvas instanceof HTMLCanvasElement
  ) {
    canvas.style.width = `${viewW}px`;
    canvas.style.height = `${viewH}px`;
  }
  canvas.width = Math.max(1, Math.floor(viewW * dpr));
  canvas.height = Math.max(1, Math.floor(viewH * dpr));

  const ctx = canvas.getContext("2d");
  if (!isCanvas2DContext(ctx)) throw new Error("2D context not available.");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Pull frequently used override knobs with sensible defaults.
  const flow01 = clamp01((opt.overrides?.flow ?? 100) / 100);
  const coreStrengthK = clamp(
    (opt.overrides?.coreStrength ?? 300) / 100,
    0.6,
    3.0
  );

  // Grain configuration — depth in [0..1], scale > 0, rotation in degrees.
  const grainKind =
    opt.overrides?.grainKind ?? opt.engine?.grain?.kind ?? "paper";
  const grainDepth =
    grainKind === "none"
      ? 0
      : clamp01(
          (opt.overrides?.grainDepth ??
            opt.engine?.grain?.depth ??
            TUNING.grainDepthDefault * 100) / 100
        );
  const grainScale =
    opt.overrides?.grainScale ??
    opt.engine?.grain?.scale ??
    TUNING.grainScaleDefault;
  const grainRotateDeg =
    opt.overrides?.grainRotate ?? opt.engine?.grain?.rotate ?? 8;
  const grainRotateRad = (grainRotateDeg * Math.PI) / 180;

  // Base radius in CSS px (engine passes diameter via baseSizePx).
  const inputRadius = Math.max(0.5, (opt.baseSizePx || 8) * 0.5);
  const baseRadius = opt.overrides?.centerlinePencil
    ? Math.max(0.5, inputRadius * TUNING.bodyWidthScale)
    : inputRadius;

  // Prepare path sampling.
  const inputPath: InputPoint[] =
    opt.path && opt.path.length > 1
      ? (opt.path as InputPoint[])
      : createDefaultPreviewPath(viewW, viewH);

  // Step tuned as a fraction of radius; balance quality/perf.
  const arcStep = Math.max(0.45, baseRadius * 0.15);
  const samples = resamplePathUniform(inputPath, arcStep);
  if (!samples.length) return;

  const totalLen = samples[samples.length - 1].arcLen;

  /** Radius profile along the stroke (bell + long, shallow taper) */
  const radiusAt = (s: number) => {
    const tipTStart = clamp01(
      s /
        clamp(
          baseRadius * TUNING.taperRadiusFactor,
          TUNING.taperMin,
          TUNING.taperMax
        )
    );
    const tipTEnd = clamp01(
      (totalLen - s) /
        clamp(
          baseRadius * TUNING.taperRadiusFactor,
          TUNING.taperMin,
          TUNING.taperMax
        )
    );
    const baseTaper = Math.min(easePowOut(tipTStart), easePowOut(tipTEnd));

    // sharpen tips a touch as we approach ends
    const edge = Math.min(tipTStart, tipTEnd);
    const sharpen = 1 - TUNING.tipSharpenBoost * Math.pow(1 - edge, 1.6);

    // mild mid-body boost (graphite belly)
    const u = clamp01(s / Math.max(1e-6, totalLen));
    const bell = 1 - 4 * Math.pow(u - 0.5, 2);
    const midBoost = 1 + TUNING.midBoostAmt * Math.pow(Math.max(0, bell), 1.2);

    return baseRadius * clamp01(baseTaper * sharpen) * midBoost;
  };

  /** Microscopic jitter along the tangent direction to avoid "too perfect" digital lines */
  const computeMicroJitter = (s: number, angle: number) => {
    const tip = Math.min(
      s /
        clamp(
          baseRadius * TUNING.taperRadiusFactor,
          TUNING.taperMin,
          TUNING.taperMax
        ),
      (totalLen - s) /
        clamp(
          baseRadius * TUNING.taperRadiusFactor,
          TUNING.taperMin,
          TUNING.taperMax
        )
    );
    const fadeTowardTips = clamp01(1 - tip * 1.5);
    const u = clamp01(s / Math.max(1e-6, totalLen));
    const bell = 1 - 4 * Math.pow(u - 0.5, 2);
    const amplitude =
      TUNING.microJitterPx * fadeTowardTips * (0.7 + 0.3 * bell);
    const j = amplitude * Math.sin(s * TUNING.microJitterFreq);
    return { ox: Math.cos(angle) * j, oy: Math.sin(angle) * j };
  };

  // Build outline and clip drawing to the ribbon interior.
  const ribbonPath = buildRibbonOutlinePath(samples, radiusAt);
  ctx.save();
  ctx.clip(ribbonPath);

  /* ---------------------------------------------------------------------- *
   * 1) Base fill (sets general darkness)
   * ---------------------------------------------------------------------- */
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgba(0,0,0,${(0.62 * flow01).toFixed(3)})`;
  ctx.fill(ribbonPath, "nonzero");

  /* ---------------------------------------------------------------------- *
   * 2) Opacity spine (soft dark center to ensure solid core)
   * ---------------------------------------------------------------------- */
  {
    const meanR = baseRadius * 0.95;
    const blurPx = Math.max(
      MIN_BLUR,
      TUNING.glazeBlurPx * TUNING.opacitySpineBlurK
    );
    ctx.filter = `blur(${blurPx}px)`;
    ctx.strokeStyle = `rgba(0,0,0,${(TUNING.opacitySpineAlpha * coreStrengthK).toFixed(3)})`;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const j = computeMicroJitter(s.arcLen, s.angle);
      if (i === 0) ctx.moveTo(s.x + j.ox, s.y + j.oy);
      else ctx.lineTo(s.x + j.ox, s.y + j.oy);
    }
    ctx.lineWidth = Math.max(MIN_STROKE_PX, meanR * TUNING.opacitySpineWidth);
    ctx.stroke();
    ctx.filter = "none";
  }

  /* ---------------------------------------------------------------------- *
   * 3) Plate (broad multiply pass for belly depth)
   * ---------------------------------------------------------------------- */
  ctx.globalCompositeOperation = "multiply";
  {
    const meanR = baseRadius * 0.95;
    const plateWidth = Math.max(1.0, meanR * 1.96);
    ctx.filter = `blur(${Math.max(MIN_BLUR, TUNING.glazeBlurPx * 1.15).toFixed(3)}px)`;
    ctx.strokeStyle = `rgba(0,0,0,${(TUNING.plateAlpha * coreStrengthK).toFixed(3)})`;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const j = computeMicroJitter(s.arcLen, s.angle);
      if (i === 0) ctx.moveTo(s.x + j.ox, s.y + j.oy);
      else ctx.lineTo(s.x + j.ox, s.y + j.oy);
    }
    ctx.lineWidth = Math.max(MIN_STROKE_PX, plateWidth);
    ctx.stroke();
    ctx.filter = "none";
  }

  /* ---------------------------------------------------------------------- *
   * 4) Layered glazes (two passes) — deepen center without crushing rim
   * ---------------------------------------------------------------------- */
  ctx.filter = `blur(${Math.max(MIN_BLUR, TUNING.glazeBlurPx).toFixed(3)}px)`;
  {
    const meanR = baseRadius * 0.95;

    ctx.strokeStyle = `rgba(0,0,0,${(TUNING.glaze1Alpha * coreStrengthK).toFixed(3)})`;
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const j = computeMicroJitter(s.arcLen, s.angle);
      if (i === 0) ctx.moveTo(s.x + j.ox, s.y + j.oy);
      else ctx.lineTo(s.x + j.ox, s.y + j.oy);
    }
    ctx.lineWidth = Math.max(MIN_STROKE_PX, meanR * 1.34);
    ctx.stroke();

    ctx.strokeStyle = `rgba(0,0,0,${(TUNING.glaze2Alpha * coreStrengthK).toFixed(3)})`;
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const j = computeMicroJitter(s.arcLen, s.angle);
      if (i === 0) ctx.moveTo(s.x + j.ox, s.y + j.oy);
      else ctx.lineTo(s.x + j.ox, s.y + j.oy);
    }
    ctx.lineWidth = Math.max(MIN_STROKE_PX, meanR * 1.58);
    ctx.stroke();
  }

  /* ---------------------------------------------------------------------- *
   * 5) Spine glaze — tight, slightly sharper core enhancement
   * ---------------------------------------------------------------------- */
  ctx.filter = `blur(${Math.max(MIN_BLUR, TUNING.glazeBlurPx * 0.85).toFixed(3)}px)`;
  {
    const meanR = baseRadius * 0.95;
    ctx.strokeStyle = `rgba(0,0,0,${(TUNING.spineAlpha * coreStrengthK).toFixed(3)})`;
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const j = computeMicroJitter(s.arcLen, s.angle);
      if (i === 0) ctx.moveTo(s.x + j.ox, s.y + j.oy);
      else ctx.lineTo(s.x + j.ox, s.y + j.oy);
    }
    ctx.lineWidth = Math.max(MIN_STROKE_PX, meanR * 0.96);
    ctx.stroke();
  }
  ctx.filter = "none";

  /* ---------------------------------------------------------------------- *
   * 6) Light tip fade (destination-in gradient along the stroke)
   * ---------------------------------------------------------------------- */
  {
    const first = samples[0];
    const last = samples[samples.length - 1];
    ctx.globalCompositeOperation = "destination-in";
    const tipFade = ctx.createLinearGradient(first.x, first.y, last.x, last.y);
    tipFade.addColorStop(0.0, `rgba(0,0,0,${TUNING.tipMinAlpha.toFixed(2)})`);
    tipFade.addColorStop(0.08, "rgba(0,0,0,1.0)");
    tipFade.addColorStop(0.92, "rgba(0,0,0,1.0)");
    tipFade.addColorStop(1.0, `rgba(0,0,0,${TUNING.tipMinAlpha.toFixed(2)})`);
    ctx.fillStyle = tipFade;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.globalCompositeOperation = "source-over";
  }

  /* ---------------------------------------------------------------------- *
   * 7) Inner rim polish — slight inner erode to keep rim clean
   * ---------------------------------------------------------------------- */
  {
    ctx.globalCompositeOperation = "destination-out";
    (ctx as CanvasRenderingContext2D).filter = "blur(0.35px)";
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 0.7; // thin band inside the outline
    ctx.stroke(ribbonPath);
    (ctx as CanvasRenderingContext2D).filter = "none";
    ctx.globalCompositeOperation = "source-over";
  }

  /* ---------------------------------------------------------------------- *
   * 8) Grain & fine dust (multiply), masked to core and faded at tips
   * ---------------------------------------------------------------------- */
  if (grainDepth > 0.001) {
    const seed = (opt.seed ?? 7) % 997;
    const grainTile = createNoiseTile(64, 31 * seed + 7);
    const first = samples[0];
    const last = samples[samples.length - 1];

    // 8a) Multiply grain, rotated/scaled and slightly anisotropic.
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.translate(first.x, first.y);
    ctx.rotate(grainRotateRad);
    ctx.scale(TUNING.grainAnisoX, TUNING.grainAnisoY);
    const grainExtent = Math.max(
      32,
      Math.ceil((viewW + viewH) / Math.max(0.5, grainScale))
    );
    ctx.globalAlpha = grainDepth * 0.22;
    ctx.drawImage(
      grainTile,
      -grainExtent / 2,
      -grainExtent / 2,
      grainExtent,
      grainExtent
    );
    ctx.restore();

    // 8b) Restrict grain to a slightly narrower "core" band.
    ctx.globalCompositeOperation = "destination-in";
    const meanR = baseRadius * 0.95;
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(0.8, meanR * 1.24);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < samples.length; i++)
      ctx.lineTo(samples[i].x, samples[i].y);
    ctx.stroke();

    ctx.globalCompositeOperation = "source-over";

    // 8c) Fine dust — subtler, scaled differently and lightly rotated
    const dustTile = createNoiseTile(32, 101 * seed + 13);
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.translate(first.x, first.y);
    ctx.rotate(grainRotateRad * TUNING.fineDustRotateK);
    ctx.scale(1.08, 1.08);
    const dustExtent = Math.max(
      16,
      Math.ceil((viewW + viewH) / TUNING.fineDustScaleDiv)
    );
    ctx.globalAlpha = grainDepth * TUNING.fineDustAlphaK;
    ctx.drawImage(
      dustTile,
      -dustExtent / 2,
      -dustExtent / 2,
      dustExtent,
      dustExtent
    );
    ctx.restore();

    // 8d) Fade dust toward tips and keep it within the core band
    ctx.globalCompositeOperation = "destination-in";
    const dustFade = ctx.createLinearGradient(first.x, first.y, last.x, last.y);
    dustFade.addColorStop(0.0, "rgba(0,0,0,0.50)");
    dustFade.addColorStop(0.5, "rgba(0,0,0,1.00)");
    dustFade.addColorStop(1.0, "rgba(0,0,0,0.50)");
    ctx.fillStyle = dustFade;
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.globalCompositeOperation = "destination-in";
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.lineWidth = Math.max(0.7, baseRadius * 1.16);
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
