// FILE: src/lib/brush/backends/particle.ts
/**
 * Particle backend — pressure-scaled emission of short-lived dots.
 * - Uses stroke spacing from engine.strokePath / overrides.
 * - Pressure maps to emission count and particle size (via mapPressure).
 * - Motion integrates a few steps with damping + scatter.
 * - Draws into an offscreen "ink" layer once, then composites to ctx.
 *
 * IMPORTANT: The engine has already sized & DPR-scaled the target layer.
 *            Draw only in CSS space; don't resize canvas or setTransform here.
 */

import type { RenderOptions, RenderPathPoint } from "@/lib/brush/engine";
import { Rand, Stroke as StrokeUtil, CanvasUtil, Blend } from "@backends";

import type { BrushInputConfig } from "@/data/brushPresets";
import { mapPressure, type PressureMapOpts } from "@/lib/brush/core/pressure";

type Ctx2D = CanvasUtil.Ctx2D;

/* ========================================================================== *
 * Helpers
 * ========================================================================== */

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

type SamplePoint = { x: number; y: number; t: number; p: number; ang: number };

/** Build a simple PressureMap from normalized input. */
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

function resamplePathWithAngle(
  points: ReadonlyArray<RenderPathPoint>,
  stepPx: number,
  pmap?: PressureMapOpts
): SamplePoint[] {
  // Prefer shared resampler if available
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

  const step = Math.max(0.6, Math.min(3.0, stepPx));
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
 * Main
 * ========================================================================== */

export default function drawParticle(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  if (pts.length < 2) return;

  const ov = (opt.engine.overrides ?? {}) as Record<string, unknown>;
  const flow01 = clamp01(((ov.flow as number) ?? 100) / 100);
  const opacity01 = clamp01(((ov.opacity as number) ?? 100) / 100);
  const color = opt.color ?? "#000000";

  // Base diameter -> radius for sizing particles
  const baseRadiusPx = Math.max(0.5, (opt.baseSizePx || 8) * 0.5);

  // Spacing (fraction of diameter). Accept UI % or raw fraction; prefer shared util.
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
  const stepPx = Math.max(0.6, Math.min(4.0, baseRadiusPx * spacingFrac));

  // Jitter/scatter (CSS px)
  const jitterPct = Math.max(
    0,
    (opt.engine.strokePath?.jitter ?? (ov.jitter as number) ?? 0) as number
  );
  const scatterPx = Math.max(
    0,
    (opt.engine.strokePath?.scatter ?? (ov.scatter as number) ?? 0) as number
  );

  // Emission multiplier from path.count (stamps per step)
  const countMul = Math.max(
    1,
    Math.round(
      (opt.engine.strokePath?.count ?? (ov.count as number) ?? 1) as number
    )
  );

  // ---- Per-brush tunables (overrides) with sane defaults ----
  const emissionBase = Math.max(
    1,
    Math.round((ov.particleEmissionBase as number) ?? 3)
  ); // baseline per sample
  const sizeK = Math.max(0.01, (ov.particleSizeK as number) ?? 0.22); // particle size scalar
  const speedK = Math.max(0, (ov.particleSpeedK as number) ?? 0.85); // initial velocity scalar
  const damping = Math.min(
    0.999,
    Math.max(0.5, (ov.particleDamping as number) ?? 0.86)
  );
  const lifeMin = Math.max(1, Math.floor((ov.particleLifeMin as number) ?? 4));
  const lifeMax = Math.max(
    lifeMin,
    Math.floor((ov.particleLifeMax as number) ?? 5)
  );
  const coneDeg = Math.max(0, (ov.particleConeDeg as number) ?? 18);
  const coneRad = (coneDeg * Math.PI) / 180;
  const blurPx = Math.max(0, (ov.particleBlurPx as number) ?? 0); // optional softening
  const composite = (ov.particleComposite as string) ?? "multiply"; // "multiply" | "source-over" | ...
  const fadePow = Math.max(0.1, (ov.particleFadePow as number) ?? 1.0); // 1=linear, >1=front-load alpha

  // Seeded RNG
  const seed = (opt.seed ?? 12345) >>> 0;
  const rng = Rand.mulberry32(seed);

  // Pressure shaping from engine-normalized input
  const pmap = toPressureMapFromInput(
    (opt as unknown as { input?: BrushInputConfig }).input
  );

  // Resample the path
  const samples = resamplePathWithAngle(pts, stepPx, pmap);
  if (samples.length < 2) return;

  // Offscreen ink (use CSS-size layer; engine already set DPR on parent)
  const W = Math.max(1, Math.floor(opt.width));
  const H = Math.max(1, Math.floor(opt.height));
  const ink = CanvasUtil.createLayer(W, H);
  const ix = ink.getContext("2d", { alpha: true }) as Ctx2D | null;
  if (!ix) return;

  // Assign color (TS lib may omit on Offscreen 2D; cast when assigning)
  (ix as CanvasRenderingContext2D).fillStyle = color;

  // Optional slight blur to soften dot edges (applied at the very end on ix)
  if ("filter" in (ix as CanvasRenderingContext2D)) {
    (ix as CanvasRenderingContext2D).filter = `blur(${blurPx}px)`;
  }

  // Integrate particles along the path
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];

    // Mid properties
    const p = clamp01((a.p + b.p) * 0.5);
    const ang = (a.ang + b.ang) * 0.5;

    // Emission scaled by pressure and count multiplier
    const emitCount = Math.max(
      1,
      Math.round(emissionBase * (0.6 + 0.8 * p) * countMul)
    );

    for (let n = 0; n < emitCount; n++) {
      // Start at the segment mid + jitter + normal scatter
      const t = rng.nextFloat();
      const px = lerp(a.x, b.x, t);
      const py = lerp(a.y, b.y, t);

      // Jitter along segment (as % of spacing step)
      const along = ((rng.nextFloat() * 2 - 1) * jitterPct) / 100;
      const jx = (b.x - a.x) * along;
      const jy = (b.y - a.y) * along;

      // Normal scatter
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      const sc = scatterPx > 0 ? (rng.nextFloat() * 2 - 1) * scatterPx : 0;

      // Initial position
      let x = px + jx + nx * sc;
      let y = py + jy + ny * sc;

      // Initial velocity along heading + cone jitter
      const cone = (rng.nextFloat() * 2 - 1) * coneRad;
      const dir = ang + cone;
      let vx =
        Math.cos(dir) * speedK * (0.6 + 0.8 * rng.nextFloat()) * baseRadiusPx;
      let vy =
        Math.sin(dir) * speedK * (0.6 + 0.8 * rng.nextFloat()) * baseRadiusPx;

      // Particle size and alpha (pressure scaled)
      const r = Math.max(
        0.5,
        baseRadiusPx *
          (sizeK * (0.6 + 0.8 * Math.pow(p, 0.9))) *
          (0.6 + 0.8 * rng.nextFloat())
      );
      const lifeSteps = Math.floor(
        lifeMin + rng.nextFloat() * (lifeMax - lifeMin + 1)
      );
      const a0 = opacity01 * flow01 * (0.65 + 0.35 * p);

      // Integrate & draw
      for (let s = 0; s < lifeSteps; s++) {
        const lifeT = lifeSteps <= 1 ? 1 : s / (lifeSteps - 1); // 0..1
        const alpha = a0 * Math.pow(1 - lifeT, fadePow);
        ix.globalAlpha = alpha;

        ix.beginPath();
        ix.arc(x, y, r, 0, Math.PI * 2, false);
        ix.fill();

        // Step motion (dt ≈ 0.08)
        x += vx * 0.08;
        y += vy * 0.08;
        vx *= damping;
        vy *= damping;
      }
    }
  }

  // Clear filter for safety
  if ("filter" in (ix as CanvasRenderingContext2D)) {
    (ix as CanvasRenderingContext2D).filter = "none";
  }

  // Composite ink onto destination (default multiply for graphite/ink looks)
  Blend.withCompositeAndAlpha(
    ctx,
    (composite as GlobalCompositeOperation) || "multiply",
    1.0,
    () => {
      ctx.drawImage(ink, 0, 0);
    }
  );
}

export const backendId = "particle" as const;

export async function drawParticleToCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opt: RenderOptions
): Promise<void> {
  const ctx = canvas.getContext("2d", { alpha: true }) as Ctx2D | null;
  if (!ctx) return;
  // Engine already sized & DPR-scaled the layer; draw in CSS space.
  drawParticle(ctx, opt);
}
