// FILE: src/lib/brush/backends/pattern.ts
/**
 * Pattern backend — fills a ribbon-shaped stroke with a repeated pattern.
 * - patternKind:  "paper" | "canvas" | "noise" | "checker" (defaults from engine.grain.kind)
 * - patternScale: tile scale (defaults from engine.grain.scale)
 * - patternRotateDeg: tile rotation in degrees (defaults from engine.grain.rotate)
 * - patternAlpha: pattern intensity (0..1), multiplied by flow/opacity
 * - patternContrast: extra multiply over pattern (0..1, 0=none, 0.3 typical)
 * - patternTipFade: fade at tips (0..1)
 * - patternComposite: final composite mode (default "multiply")
 *
 * IMPORTANT: Draw only in CSS space; the engine sized & DPR-scaled the layer.
 */

import type { RenderOptions, RenderPathPoint } from "@/lib/brush/engine";
import {
  Rand,
  Stroke as StrokeUtil,
  CanvasUtil,
  Blend,
  Texture as TexUtil,
} from "@backends";

import type { BrushInputConfig } from "@/data/brushPresets";
import { mapPressure, type PressureMapOpts } from "@/lib/brush/core/pressure";

type Ctx2D = CanvasUtil.Ctx2D;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/* ========================================================================== *
 * Pressure map from input
 * ========================================================================== */

function toPressureMapFromInput(
  input?: BrushInputConfig
): PressureMapOpts | undefined {
  if (!input) return undefined;
  const gamma =
    input.pressure.curve?.type === "gamma"
      ? input.pressure.curve.gamma
      : undefined;
  const deadZone =
    typeof input.pressure.clamp?.min === "number"
      ? Math.max(0, Math.min(0.5, input.pressure.clamp.min))
      : undefined;
  return gamma === undefined && deadZone === undefined
    ? undefined
    : { gamma, deadZone };
}

/* ========================================================================== *
 * Path resampling (prefers shared StrokeUtil)
 * ========================================================================== */

type SamplePoint = { x: number; y: number; t: number; p: number; ang: number };

function resamplePathWithAngle(
  points: ReadonlyArray<RenderPathPoint>,
  stepPx: number,
  pmap?: PressureMapOpts
): SamplePoint[] {
  if (StrokeUtil?.resamplePath) {
    const pts = StrokeUtil.resamplePath(
      points as RenderPathPoint[],
      stepPx
    ) as Array<{ x: number; y: number; t: number; p: number; angle?: number }>;
    const out: SamplePoint[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const ang =
        typeof pts[i].angle === "number"
          ? (pts[i].angle as number)
          : Math.atan2(b.y - a.y, b.x - a.x);
      const p = clamp01(mapPressure(clamp01(pts[i].p), pmap));
      out.push({ x: pts[i].x, y: pts[i].y, t: pts[i].t, p, ang });
    }
    return out;
  }

  // Local fallback
  const out: SamplePoint[] = [];
  if (!points || points.length < 2) return out;

  const N = points.length;
  const segLen: number[] = new Array<number>(N).fill(0);
  let total = 0;
  for (let i = 1; i < N; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const L = Math.hypot(dx, dy);
    segLen[i] = L;
    total += L;
  }
  if (total <= 0) return out;

  const prefix: number[] = new Array<number>(N).fill(0);
  for (let i = 1; i < N; i++) prefix[i] = prefix[i - 1] + segLen[i];

  function posAt(sArc: number): {
    x: number;
    y: number;
    p: number;
    ang: number;
  } {
    const s = Math.max(0, Math.min(total, sArc));
    let idx = 1;
    while (idx < N && prefix[idx] < s) idx++;
    const i0 = Math.max(1, idx);
    const s0 = prefix[i0 - 1];
    const L = segLen[i0];
    const u = L > 0 ? (s - s0) / L : 0;

    const a = points[i0 - 1];
    const b = points[i0];
    const x = a.x + (b.x - a.x) * u;
    const y = a.y + (b.y - a.y) * u;
    const ap = typeof a.pressure === "number" ? clamp01(a.pressure) : 0.7;
    const bp = typeof b.pressure === "number" ? clamp01(b.pressure) : 0.7;
    const p = clamp01(mapPressure(lerp(ap, bp, u), pmap));
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    return { x, y, p, ang };
  }

  const step = Math.max(0.45, Math.min(2.0, stepPx));
  for (let s = 0; s <= total; s += step) {
    const r = posAt(s);
    out.push({
      x: r.x,
      y: r.y,
      t: total > 0 ? s / total : 0,
      p: r.p,
      ang: r.ang,
    });
  }
  if (out.length && out[out.length - 1].t < 1) {
    const r = posAt(total);
    out.push({ x: r.x, y: r.y, t: 1, p: r.p, ang: r.ang });
  }
  return out;
}

/* ========================================================================== *
 * Pattern tiles
 * ========================================================================== */

function makeDotsTile(size: number, density: number, seed: number) {
  const s = Math.max(8, Math.floor(size));
  const c = CanvasUtil.createLayer(s, s);
  const ctx = c.getContext("2d", { alpha: true }) as Ctx2D | null;
  if (!ctx) return c;
  ctx.clearRect(0, 0, s, s);
  (ctx as CanvasRenderingContext2D).fillStyle = "rgba(0,0,0,0.65)";
  const rnd = Rand.mulberry32(seed);
  const count = Math.max(1, Math.floor((s * s * density) / 140));
  for (let i = 0; i < count; i++) {
    const x = rnd.nextFloat() * s;
    const y = rnd.nextFloat() * s;
    const r = Math.max(0.4, 1.25 * rnd.nextFloat());
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2, false);
    ctx.fill();
  }
  return c;
}

function makeHatchTile(size: number, thickness: number) {
  const s = Math.max(8, Math.floor(size));
  const c = CanvasUtil.createLayer(s, s);
  const ctx = c.getContext("2d", { alpha: true }) as Ctx2D | null;
  if (!ctx) return c;
  ctx.clearRect(0, 0, s, s);
  (ctx as CanvasRenderingContext2D).strokeStyle = "rgba(0,0,0,0.6)";
  (ctx as CanvasRenderingContext2D).lineWidth = Math.max(0.5, thickness);
  ctx.beginPath();
  ctx.moveTo(-s * 0.25, s * 0.25);
  ctx.lineTo(s * 0.25, -s * 0.25);
  ctx.moveTo(s * 0.25, s * 1.25);
  ctx.lineTo(s * 1.25, s * 0.25);
  ctx.stroke();
  return c;
}

function makeCheckerTile(size: number) {
  const s = Math.max(8, Math.floor(size));
  const c = CanvasUtil.createLayer(s, s);
  const ctx = c.getContext("2d", { alpha: true }) as Ctx2D | null;
  if (!ctx) return c;
  ctx.clearRect(0, 0, s, s);
  const h = Math.floor(s / 2);
  (ctx as CanvasRenderingContext2D).fillStyle = "rgba(0,0,0,0.75)";
  ctx.fillRect(0, 0, h, h);
  ctx.fillRect(h, h, h, h);
  (ctx as CanvasRenderingContext2D).fillStyle = "rgba(0,0,0,0.15)";
  ctx.fillRect(h, 0, h, h);
  ctx.fillRect(0, h, h, h);
  return c;
}

/* ========================================================================== *
 * Ribbon outline from samples + radius profile
 * ========================================================================== */

function buildRibbonOutline(
  samples: ReadonlyArray<SamplePoint>,
  radiusAt: (u: number) => number
): Path2D {
  const left: Array<{ x: number; y: number }> = [];
  const right: Array<{ x: number; y: number }> = [];
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    const aPrev = i > 0 ? samples[i - 1].ang : samples[i].ang;
    const aNext = i < n - 1 ? samples[i + 1].ang : samples[i].ang;
    const ang = (aPrev + aNext) * 0.5;
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    const r = Math.max(0, radiusAt(samples[i].t));
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

export default function drawPattern(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  if (pts.length < 2) return;

  const color = opt.color ?? "#000000";
  const ov = (opt.engine.overrides ?? {}) as Record<string, unknown>;
  const flow01 = clamp01(((ov.flow as number) ?? 100) / 100);
  const opacity01 = clamp01(((ov.opacity as number) ?? 100) / 100);

  // Base stroke radius from diameter
  const baseRadius = Math.max(0.5, (opt.baseSizePx || 8) * 0.5);

  // Spacing fraction → step px (prefer shared util)
  const uiSpacing =
    opt.engine.strokePath?.spacing ?? (ov.spacing as number | undefined) ?? 6;
  const spacingFrac = StrokeUtil?.resolveSpacingFraction
    ? StrokeUtil.resolveSpacingFraction(uiSpacing, 6)
    : (() => {
        const raw = typeof uiSpacing === "number" ? uiSpacing : 6;
        return raw > 1
          ? Math.min(0.25, Math.max(0.01, raw / 100))
          : Math.min(0.25, Math.max(0.01, raw));
      })();
  const resampleStepPx = Math.max(
    0.45,
    Math.min(2.2, baseRadius * spacingFrac)
  );

  // Pressure shaping from engine-normalized input
  const pmap = toPressureMapFromInput(
    (opt as unknown as { input?: BrushInputConfig }).input
  );

  const samples = resamplePathWithAngle(pts, resampleStepPx, pmap);
  if (samples.length < 2) return;

  // Pressure -> width scaling
  const widthAt = (t: number, p: number): number => {
    const tip = Math.min(t, 1 - t);
    const tipMask = Math.pow(Math.min(1, tip / 0.42), 2.7); // soft tips
    const base = baseRadius * (0.7 + 0.6 * Math.pow(p, 0.85));
    return Math.max(0.5, base * (0.84 + 0.12 * tipMask));
  };

  const outline = buildRibbonOutline(samples, (u) => {
    const idx = Math.max(
      0,
      Math.min(samples.length - 1, Math.floor(u * (samples.length - 1)))
    );
    return widthAt(samples[idx].t, samples[idx].p);
  });

  // --- Pattern parameters (from engine.grain or overrides) ---
  const kind =
    (ov.patternKind as string) ??
    (opt.engine.grain?.kind as string | undefined) ??
    "paper"; // "paper"|"canvas"|"noise"|"checker"
  const scale =
    (ov.patternScale as number) ??
    (opt.engine.grain?.scale as number | undefined) ??
    1.0; // larger => coarser
  const rotateDeg =
    (ov.patternRotateDeg as number) ??
    (opt.engine.grain?.rotate as number | undefined) ??
    0;
  const patternAlpha = clamp01(((ov.patternAlpha as number) ?? 1.0) * flow01);
  const contrast = clamp01((ov.patternContrast as number) ?? 0.28); // extra multiply
  const tipFadeAmt = clamp01((ov.patternTipFade as number) ?? 0.35);
  const hatchThickness = Math.max(
    0.5,
    (ov.patternHatchThickness as number) ?? Math.max(0.6, baseRadius * 0.06)
  );
  const composite = ((ov.patternComposite as GlobalCompositeOperation) ??
    "multiply") as GlobalCompositeOperation;

  // Tile generation
  const seed = (opt.seed ?? 17) >>> 0;
  const tilePx = Math.max(
    8,
    Math.floor(baseRadius * 6 * (1 / Math.max(0.25, scale)))
  );

  const tileCanvas =
    kind === "noise"
      ? (() => {
          const tex = TexUtil.generateFbmNoiseTexture(
            Math.max(32, Math.min(256, tilePx)),
            4, // octaves
            0.5, // persistence
            2.0 // lacunarity
          );
          const c = CanvasUtil.createLayer(tex.width, tex.height);
          const cx = c.getContext("2d", {
            alpha: true,
          }) as CanvasRenderingContext2D | null;
          if (cx) {
            const id = new ImageData(tex.pixels.data, tex.width, tex.height);
            cx.putImageData(id, 0, 0);
          }
          return c;
        })()
      : kind === "canvas"
        ? makeHatchTile(tilePx, hatchThickness)
        : kind === "paper"
          ? makeDotsTile(tilePx, 1.0, seed ^ 0x55aa)
          : makeCheckerTile(tilePx);

  // --- Paint into an offscreen layer in CSS pixels ---
  const viewW = Math.max(1, Math.floor(opt.width));
  const viewH = Math.max(1, Math.floor(opt.height));
  const layer = CanvasUtil.createLayer(viewW, viewH);
  const lx = layer.getContext("2d", { alpha: true }) as Ctx2D | null;
  if (!lx) return;

  // Clip to stroke outline
  lx.save();
  lx.clip(outline);

  // Rotation about the stroke start (cheap & stable)
  const first = samples[0];
  const last = samples[samples.length - 1];
  const rot = (rotateDeg * Math.PI) / 180;
  lx.translate(first.x, first.y);
  lx.rotate(rot);
  lx.translate(-first.x, -first.y);

  // 1) Base color fill (so pattern can multiply into it → tint by opt.color)
  lx.globalCompositeOperation = "source-over";
  lx.globalAlpha = patternAlpha;
  (lx as CanvasRenderingContext2D).fillStyle = color;
  lx.fillRect(0, 0, viewW, viewH);

  // 2) Multiply the pattern onto the colored base
  const pat = lx.createPattern(
    tileCanvas as unknown as CanvasImageSource,
    "repeat"
  );
  if (pat) {
    lx.globalCompositeOperation = "multiply";
    (lx as CanvasRenderingContext2D).fillStyle = pat;
    lx.fillRect(0, 0, viewW, viewH);
  }

  // 3) Optional extra contrast & tip fade
  if (contrast > 0.001) {
    lx.globalCompositeOperation = "multiply";
    lx.globalAlpha = contrast * patternAlpha;
    (lx as CanvasRenderingContext2D).fillStyle = "#000";
    lx.fillRect(0, 0, viewW, viewH);
  }

  if (tipFadeAmt > 0.001) {
    lx.globalCompositeOperation = "destination-in";
    const tipFade = (lx as CanvasRenderingContext2D).createLinearGradient(
      first.x,
      first.y,
      last.x,
      last.y
    );
    tipFade.addColorStop(0.0, `rgba(0,0,0,${tipFadeAmt.toFixed(2)})`);
    tipFade.addColorStop(0.08, "rgba(0,0,0,1.0)");
    tipFade.addColorStop(0.92, "rgba(0,0,0,1.0)");
    tipFade.addColorStop(1.0, `rgba(0,0,0,${tipFadeAmt.toFixed(2)})`);
    (lx as CanvasRenderingContext2D).fillStyle = tipFade;
    lx.fillRect(0, 0, viewW, viewH);
  }

  lx.restore();

  // Composite to destination (engine will still apply global blend/opacity)
  Blend.withCompositeAndAlpha(ctx, composite, opacity01, () => {
    ctx.drawImage(layer, 0, 0);
  });
}

export const backendId = "pattern" as const;

export async function drawPatternToCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opt: RenderOptions
): Promise<void> {
  const ctx = canvas.getContext("2d", { alpha: true }) as Ctx2D | null;
  if (!ctx) return;
  drawPattern(ctx, opt);
}
