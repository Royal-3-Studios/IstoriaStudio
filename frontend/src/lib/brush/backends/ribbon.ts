// src/lib/brush/backends/ribbon.ts
/**
 * Ribbon backend: continuous polygon silhouette with layered glazes/grain.
 * Strong 6B pencil look (no stamping). Long tapers, dark core, clean rim.
 */

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

import type { RenderOptions } from "../engine";

const DEFAULT_COLOR = "#000000";
const PREVIEW_MIN = { width: 352, height: 128 };

/** Tuned toward Procreate 6B — long taper + solid/dark core */
const PENCIL_TUNING = {
  // geometry
  bodyWidthScale: 0.42, // was 0.44 → a hair slimmer
  taperMin: 240,
  taperMax: 770,
  taperRadiusFactor: 26.0, // was 23.6 → slightly longer tip

  tipSharpenBoost: 0.251,
  midBoostAmt: 0.15,

  // glaze stack
  glazeBlurPx: 0.52, // was 0.46 → smoother layering
  glaze1Alpha: 0.62, // your new value kept
  glaze2Alpha: 0.34, // your new value kept
  plateAlpha: 0.155, // your new value kept
  spineAlpha: 0.23, // your new value kept

  // opacity spine (source-over)
  opacitySpineAlpha: 0.36, // your new value kept
  opacitySpineBlurK: 0.55,
  opacitySpineWidth: 1.65, // was 1.55 → slightly tighter/darker core

  // micro jitter (slightly calmer so rim reads cleaner)
  microJitterPx: 0.24, // was 0.28
  microJitterFreq: 0.16, // was 0.18

  // grain
  grainDepthDefault: 0.32,
  grainScaleDefault: 1.45,
  grainAnisoX: 0.7,
  grainAnisoY: 1.35,

  // fine dust
  fineDustAlphaK: 0.13,
  fineDustScaleDiv: 4,
  fineDustRotateK: 1.2,
} as const;

// ------------------ small utils ------------------
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easePow = (t: number) => 1 - Math.pow(1 - clamp01(t), 2.3);

function seededRand(seed: number) {
  let x = seed || 123456789;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  };
}

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  throw new Error("No canvas implementation available.");
}
function is2DContext(ctx: unknown): ctx is Ctx2D {
  if (!ctx || typeof ctx !== "object") return false;
  const c = ctx as Record<string, unknown>;
  return typeof c.drawImage === "function" && "canvas" in c;
}
function get2DContext(c: OffscreenCanvas | HTMLCanvasElement): Ctx2D {
  const ctx = c.getContext("2d");
  if (!is2DContext(ctx)) throw new Error("2D context not available.");
  return ctx;
}
function makeNoiseTile(size = 64, seed = 1) {
  const c = makeCanvas(size, size);
  const ctx = get2DContext(c);
  const img = ctx.createImageData(size, size);
  const rnd = seededRand(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (rnd() * 0.6 + rnd() * 0.4) * 255;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---------------- path helpers ----------------
function defaultPath(w: number, h: number) {
  const pts: Array<{ x: number; y: number; angle: number }> = [];
  const x0 = Math.max(6, Math.floor(w * 0.06));
  const x1 = Math.min(w - 6, Math.floor(w * 0.94));
  const midY = Math.floor(h * 0.6);
  const amp = Math.max(6, Math.min(h * 0.35, 32));
  const steps = 72;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = midY - amp * t + amp * 0.45 * Math.sin(6.5 * t);
    const dx = (x1 - x0) / steps;
    const dy = -amp / steps + (amp * 0.45 * 6.5 * Math.cos(6.5 * t)) / steps;
    pts.push({ x, y, angle: Math.atan2(dy, dx) });
  }
  return pts;
}
type Sample = { x: number; y: number; angle: number; s: number };
function resampleUniform(
  path: Array<{ x: number; y: number; angle?: number }>,
  step: number
): Sample[] {
  if (!path.length) return [];
  const segs: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    segs[i] = segs[i - 1] + Math.hypot(dx, dy);
  }
  const L = segs[segs.length - 1];
  if (L <= 0) return [];
  const out: Sample[] = [];
  for (let d = 0; d <= L; d += step) {
    let i = 1;
    while (i < segs.length && segs[i] < d) i++;
    const s0 = segs[i - 1],
      s1 = segs[i];
    const t = Math.min(1, Math.max(0, (d - s0) / Math.max(1e-6, s1 - s0)));
    const p0 = path[i - 1],
      p1 = path[i];
    const x = lerp(p0.x, p1.x, t),
      y = lerp(p0.y, p1.y, t);
    const ang =
      p0.angle != null && p1.angle != null
        ? lerp(p0.angle, p1.angle, t)
        : Math.atan2(p1.y - p0.y, p1.x - p0.x);
    out.push({ x, y, angle: ang, s: d });
  }
  return out;
}
function buildRibbonPath(
  samples: Sample[],
  radiusAt: (s: number) => number
): Path2D {
  const left: Array<{ x: number; y: number }> = [];
  const right: Array<{ x: number; y: number }> = [];
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    const aPrev = i > 0 ? samples[i - 1].angle : samples[i].angle;
    const aNext = i < n - 1 ? samples[i + 1].angle : samples[i].angle;
    const ang = (aPrev + aNext) * 0.5;
    const nx = -Math.sin(ang),
      ny = Math.cos(ang);
    const r = Math.max(0, radiusAt(samples[i].s));
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

// ---------------------- main ----------------------
export async function drawRibbonToCanvas(
  canvas: HTMLCanvasElement,
  opt: RenderOptions
): Promise<void> {
  const dpr =
    typeof window !== "undefined"
      ? Math.min(opt.pixelRatio ?? window.devicePixelRatio ?? 1, 2) // cap if you want
      : Math.max(1, opt.pixelRatio ?? 1);
  // Stabilizers for low DPR rendering
  const LOW_DPR = dpr <= 1.05;
  const MIN_BLUR = LOW_DPR ? 0.9 : 0.6; // avoid sub-pixel blur speckle
  const MIN_STROKE = LOW_DPR ? 1.0 : 0.8; // avoid sub-px core strokes

  const minW = opt.overrides?.centerlinePencil ? PREVIEW_MIN.width : 1;
  const minH = opt.overrides?.centerlinePencil ? PREVIEW_MIN.height : 1;
  const targetW = Math.max(minW, Math.floor(opt.width || PREVIEW_MIN.width));
  const targetH = Math.max(minH, Math.floor(opt.height || PREVIEW_MIN.height));

  if (
    typeof HTMLCanvasElement !== "undefined" &&
    canvas instanceof HTMLCanvasElement
  ) {
    canvas.style.width = `${targetW}px`;
    canvas.style.height = `${targetH}px`;
  }
  canvas.width = Math.max(1, Math.floor(targetW * dpr));
  canvas.height = Math.max(1, Math.floor(targetH * dpr));

  const ctx = canvas.getContext("2d");
  if (!is2DContext(ctx)) throw new Error("2D context not available.");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, targetW, targetH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const color = opt.color ?? DEFAULT_COLOR;
  void color; // reserved for future color variants

  // CSS units
  const baseRadiusRaw = Math.max(0.5, (opt.baseSizePx || 8) * 0.5);
  const baseRadius = opt.overrides?.centerlinePencil
    ? Math.max(0.5, baseRadiusRaw * PENCIL_TUNING.bodyWidthScale)
    : baseRadiusRaw;

  const flow = clamp01((opt.overrides?.flow ?? 100) / 100);
  const coreK = clamp((opt.overrides?.coreStrength ?? 300) / 100, 0.6, 3.0);

  // Grain parameters (single computation; used later)
  const grainKind =
    opt.overrides?.grainKind ?? opt.engine?.grain?.kind ?? "paper";
  const grainScale =
    opt.overrides?.grainScale ??
    opt.engine?.grain?.scale ??
    PENCIL_TUNING.grainScaleDefault;
  const grainDepth =
    grainKind === "none"
      ? 0
      : clamp01(
          (opt.overrides?.grainDepth ??
            opt.engine?.grain?.depth ??
            PENCIL_TUNING.grainDepthDefault * 100) / 100
        );
  const grainRotateDeg =
    opt.overrides?.grainRotate ?? opt.engine?.grain?.rotate ?? 8;
  const grainRotateRad = (grainRotateDeg * Math.PI) / 180;

  // path + samples
  const rawPath =
    opt.path && opt.path.length > 1 ? opt.path : defaultPath(targetW, targetH);
  const step = Math.max(0.45, baseRadius * 0.15);
  const samples = resampleUniform(rawPath, step);
  if (!samples.length) return;

  // taper logic (distance-based)
  const totalLen = samples[samples.length - 1].s;
  const taperLen = clamp(
    baseRadius * PENCIL_TUNING.taperRadiusFactor,
    PENCIL_TUNING.taperMin,
    PENCIL_TUNING.taperMax
  );
  const radiusAt = (s: number) => {
    const tStart = clamp01(s / taperLen);
    const tEnd = clamp01((totalLen - s) / taperLen);
    const baseTaper = Math.min(easePow(tStart), easePow(tEnd));
    const edge = Math.min(tStart, tEnd);
    const sharpen = 1 - PENCIL_TUNING.tipSharpenBoost * Math.pow(1 - edge, 1.6);
    const u = clamp01(s / Math.max(1e-6, totalLen));
    const bell = 1 - 4 * Math.pow(u - 0.5, 2);
    const midBoost =
      1 + PENCIL_TUNING.midBoostAmt * Math.pow(Math.max(0, bell), 1.2);
    return baseRadius * clamp01(baseTaper * sharpen) * midBoost;
  };
  const jitterAt = (s: number, ang: number) => {
    const tip = Math.min(s / taperLen, (totalLen - s) / taperLen);
    const fadeTips = clamp01(1 - tip * 1.5);
    const u = clamp01(s / Math.max(1e-6, totalLen));
    const bell = 1 - 4 * Math.pow(u - 0.5, 2);
    const amp = PENCIL_TUNING.microJitterPx * fadeTips * (0.7 + 0.3 * bell);
    const j = amp * Math.sin(s * PENCIL_TUNING.microJitterFreq);
    return { ox: Math.cos(ang) * j, oy: Math.sin(ang) * j };
  };

  const ribbon = buildRibbonPath(samples, radiusAt);

  // ---------------- paint inside ribbon ----------------
  ctx.save();
  ctx.clip(ribbon);

  // base fill
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgba(0,0,0,${(0.62 * flow).toFixed(3)})`;
  ctx.fill(ribbon, "nonzero");

  // opacity spine
  {
    const meanR = baseRadius * 0.95;
    const blurPx = Math.max(
      MIN_BLUR,
      PENCIL_TUNING.glazeBlurPx * PENCIL_TUNING.opacitySpineBlurK
    );
    ctx.filter = `blur(${blurPx}px)`;
    ctx.strokeStyle = `rgba(0,0,0,${(PENCIL_TUNING.opacitySpineAlpha * coreK).toFixed(3)})`;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const j = jitterAt(s.s, s.angle);
      if (i === 0) ctx.moveTo(s.x + j.ox, s.y + j.oy);
      else ctx.lineTo(s.x + j.ox, s.y + j.oy);
    }
    ctx.lineWidth = Math.max(
      MIN_STROKE,
      meanR * PENCIL_TUNING.opacitySpineWidth
    );
    ctx.stroke();
    ctx.filter = "none";
  }

  // plate
  ctx.globalCompositeOperation = "multiply";
  {
    const meanR = baseRadius * 0.95;
    const plateW = Math.max(1.0, meanR * 1.96);
    ctx.filter = `blur(${Math.max(MIN_BLUR, PENCIL_TUNING.glazeBlurPx * 1.15).toFixed(3)}px)`;
    ctx.strokeStyle = `rgba(0,0,0,${(PENCIL_TUNING.plateAlpha * coreK).toFixed(3)})`;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const j = jitterAt(s.s, s.angle);
      if (i === 0) ctx.moveTo(s.x + j.ox, s.y + j.oy);
      else ctx.lineTo(s.x + j.ox, s.y + j.oy);
    }
    ctx.lineWidth = Math.max(MIN_STROKE, plateW);
    ctx.stroke();
    ctx.filter = "none";
  }

  // glazes
  ctx.filter = `blur(${Math.max(MIN_BLUR, PENCIL_TUNING.glazeBlurPx).toFixed(3)}px)`;
  {
    const meanR = baseRadius * 0.95;

    ctx.strokeStyle = `rgba(0,0,0,${(PENCIL_TUNING.glaze1Alpha * coreK).toFixed(3)})`;
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const j = jitterAt(s.s, s.angle);
      if (i === 0) ctx.moveTo(s.x + j.ox, s.y + j.oy);
      else ctx.lineTo(s.x + j.ox, s.y + j.oy);
    }
    ctx.lineWidth = Math.max(MIN_STROKE, meanR * 1.34);
    ctx.stroke();

    ctx.strokeStyle = `rgba(0,0,0,${(PENCIL_TUNING.glaze2Alpha * coreK).toFixed(3)})`;
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const j = jitterAt(s.s, s.angle);
      if (i === 0) ctx.moveTo(s.x + j.ox, s.y + j.oy);
      else ctx.lineTo(s.x + j.ox, s.y + j.oy);
    }
    ctx.lineWidth = Math.max(MIN_STROKE, meanR * 1.58);
    ctx.stroke();
  }

  // spine glaze
  ctx.filter = `blur(${Math.max(MIN_BLUR, PENCIL_TUNING.glazeBlurPx * 0.85).toFixed(3)}px)`;
  {
    const meanR = baseRadius * 0.95;
    ctx.strokeStyle = `rgba(0,0,0,${(PENCIL_TUNING.spineAlpha * coreK).toFixed(3)})`;
    ctx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const j = jitterAt(s.s, s.angle);
      if (i === 0) ctx.moveTo(s.x + j.ox, s.y + j.oy);
      else ctx.lineTo(s.x + j.ox, s.y + j.oy);
    }
    ctx.lineWidth = Math.max(MIN_STROKE, meanR * 0.96);
    ctx.stroke();
  }
  ctx.filter = "none";

  // Tip fade: make ends lighter like Procreate
  {
    ctx.globalCompositeOperation = "destination-in";
    const g = ctx.createLinearGradient(
      samples[0].x,
      samples[0].y,
      samples[samples.length - 1].x,
      samples[samples.length - 1].y
    );
    // lighter at extreme ends, full through the belly
    g.addColorStop(0.0, "rgba(0,0,0,0.30)");
    g.addColorStop(0.1, "rgba(0,0,0,0.75)");
    g.addColorStop(0.5, "rgba(0,0,0,1.00)");
    g.addColorStop(0.9, "rgba(0,0,0,0.75)");
    g.addColorStop(1.0, "rgba(0,0,0,0.30)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.globalCompositeOperation = "source-over";
  }

  // Edge polish: very slight inner erode to soften the rim
  {
    ctx.globalCompositeOperation = "destination-out";
    (ctx as CanvasRenderingContext2D).filter = "blur(0.35px)";
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 0.7; // thin band along the inside rim
    ctx.stroke(ribbon);
    (ctx as CanvasRenderingContext2D).filter = "none";
    ctx.globalCompositeOperation = "source-over";
  }

  // grain inside only (uses precomputed grainScale/rotate/depth)
  if (grainDepth > 0.001) {
    const tile = makeNoiseTile(64, 31 * ((opt.seed ?? 7) % 997) + 7);
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.translate(samples[0].x, samples[0].y);
    ctx.rotate(grainRotateRad);
    ctx.scale(PENCIL_TUNING.grainAnisoX, PENCIL_TUNING.grainAnisoY);
    const w = Math.max(
      32,
      Math.ceil((targetW + targetH) / Math.max(0.5, grainScale))
    );
    ctx.globalAlpha = grainDepth * 0.22;
    ctx.drawImage(tile, -w / 2, -w / 2, w, w);
    ctx.restore();

    // core mask (narrower than ribbon)
    ctx.globalCompositeOperation = "destination-in";
    const meanR = baseRadius * 0.95;
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(0.8, meanR * 1.24);
    ctx.beginPath();
    ctx.moveTo(samples[0].x, samples[0].y);
    for (let i = 1; i < samples.length; i++)
      ctx.lineTo(samples[i].x, samples[i].y);
    ctx.stroke();

    ctx.globalCompositeOperation = "source-over";

    // fine dust
    const fineTile = makeNoiseTile(32, 101 * ((opt.seed ?? 7) % 997) + 13);
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.translate(samples[0].x, samples[0].y);
    ctx.rotate(grainRotateRad * PENCIL_TUNING.fineDustRotateK);
    ctx.scale(1.08, 1.08);
    const wf = Math.max(
      16,
      Math.ceil((targetW + targetH) / PENCIL_TUNING.fineDustScaleDiv)
    );
    ctx.globalAlpha = grainDepth * PENCIL_TUNING.fineDustAlphaK;
    ctx.drawImage(fineTile, -wf / 2, -wf / 2, wf, wf);
    ctx.restore();

    // fade dust toward ends
    ctx.globalCompositeOperation = "destination-in";
    const g = ctx.createLinearGradient(
      samples[0].x,
      samples[0].y,
      samples[samples.length - 1].x,
      samples[samples.length - 1].y
    );
    g.addColorStop(0.0, "rgba(0,0,0,0.50)");
    g.addColorStop(0.5, "rgba(0,0,0,1.00)");
    g.addColorStop(1.0, "rgba(0,0,0,0.50)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, targetW, targetH);

    // keep dust in core
    ctx.globalCompositeOperation = "destination-in";
    ctx.strokeStyle = "rgba(0,0,0,1)";
    ctx.lineWidth = Math.max(0.7, baseRadius * 1.16);
    ctx.beginPath();
    ctx.moveTo(samples[0].x, samples[0].y);
    for (let i = 1; i < samples.length; i++)
      ctx.lineTo(samples[i].x, samples[i].y);
    ctx.stroke();

    ctx.globalCompositeOperation = "source-over";
  }

  // Tip fade along the stroke (lighten ends a bit)
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  const fade = ctx.createLinearGradient(
    samples[0].x,
    samples[0].y,
    samples[samples.length - 1].x,
    samples[samples.length - 1].y
  );
  // keep 100% through the middle, ease to ~25% at the tips
  fade.addColorStop(0.0, "rgba(0,0,0,0.25)");
  fade.addColorStop(0.08, "rgba(0,0,0,1.0)");
  fade.addColorStop(0.92, "rgba(0,0,0,1.0)");
  fade.addColorStop(1.0, "rgba(0,0,0,0.25)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.restore();

  ctx.restore();
}

export default drawRibbonToCanvas;
