// FILE: src/lib/brush/backends/smudge.ts
/**
 * Smudge backend — circular pickup/drag with pressure radius and softness.
 * - Snapshots the current layer as a source, then drags pixels along the path.
 * - Uses spacing from engine.strokePath and pressure for radius/strength.
 * - Softness uses a tiny blur during stamps to avoid banding.
 *
 * Exposed overrides:
 *   flow           (0–100) overall strength
 *   softness       (0–100) blur while stamping
 *   smudgeStrength (0..2)  drag offset multiplier
 *   smudgeAlpha    (0..2)  alpha multiplier
 *   smudgeBlur     (px)    extra blur
 *   smudgeSpacing  (%)     overrides spacing
 *
 * NOTE: This backend expects the context to already contain the image you want
 * to smudge. In the main painting pipeline, call this on a layer with artwork;
 * in previews you’ll typically skip smudge.
 */

import type { RenderOptions, RenderPathPoint } from "@/lib/brush/engine";
import { Stroke as StrokeUtil, CanvasUtil } from "@backends";

type Ctx2D = CanvasUtil.Ctx2D;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

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

  function posAt(sArc: number): { x: number; y: number; p: number } {
    const s = Math.max(0, Math.min(total, sArc));
    let idx = 1;
    while (idx < N && prefix[idx] < s) idx++;
    const i0 = Math.max(1, idx);
    const s0 = prefix[i0 - 1];
    const L = segLen[i0];
    const u = L > 0 ? (s - s0) / L : 0;

    const a = points[i0 - 1];
    const b = points[i0];
    const ap = typeof a.pressure === "number" ? clamp01(a.pressure) : 0.7;
    const bp = typeof b.pressure === "number" ? clamp01(b.pressure) : 0.7;
    const p = lerp(ap, bp, u);

    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, p };
  }

  const first = posAt(0);
  out.push({ x: first.x, y: first.y, t: 0, p: first.p });

  const step = Math.max(0.5, Math.min(2.5, stepPx));
  for (let s = step; s < total; s += step) {
    const p = posAt(s);
    out.push({ x: p.x, y: p.y, t: s / total, p: p.p });
  }
  const last = posAt(total);
  out.push({ x: last.x, y: last.y, t: 1, p: last.p });

  return out;
}

/* ========================================================================== *
 * Main render
 * ========================================================================== */

export default function drawSmudge(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  if (pts.length < 2) return;

  const ov = opt.engine.overrides ?? {};
  const flow01 = clamp01(((ov.flow ?? 85) as number) / 100);
  const softness01 = clamp01(((ov.softness ?? 50) as number) / 100);

  // Extra knobs
  const dragMul = (ov.smudgeStrength as number) ?? 0.65; // default 65% of delta
  const alphaMul = (ov.smudgeAlpha as number) ?? 0.85;
  const extraBlur = (ov.smudgeBlur as number) ?? 0;
  const spacingOverride = ov.smudgeSpacing as number | undefined;

  // Radius base
  const baseRadius = Math.max(0.5, (opt.baseSizePx || 8) * 0.5);

  // Spacing (prefer shared StrokeUtil.resolveSpacingFraction)
  const uiSpacing =
    spacingOverride ?? opt.engine.strokePath?.spacing ?? ov.spacing ?? 6;
  const spacingFrac = StrokeUtil?.resolveSpacingFraction
    ? StrokeUtil.resolveSpacingFraction(uiSpacing, 6)
    : (() => {
        const raw = typeof uiSpacing === "number" ? uiSpacing : 6;
        return raw > 1
          ? Math.min(0.25, Math.max(0.01, raw / 100))
          : Math.min(0.25, Math.max(0.01, raw));
      })();
  const stepPx = Math.max(0.8, Math.min(3.0, baseRadius * spacingFrac));

  const samples = resamplePath(pts, stepPx);
  if (samples.length < 2) return;

  // Snapshot the current canvas (pixel dimensions; engine already set DPR)
  const srcW = (ctx.canvas as HTMLCanvasElement | OffscreenCanvas).width;
  const srcH = (ctx.canvas as HTMLCanvasElement | OffscreenCanvas).height;
  const src = CanvasUtil.createLayer(srcW, srcH);
  const sctx = src.getContext("2d", { alpha: true }) as Ctx2D;
  sctx.drawImage(ctx.canvas as CanvasImageSource, 0, 0);

  // Softness blur per dab
  const blurPx = 0.2 + 1.0 * softness01 + extraBlur;

  ctx.save();
  ctx.globalCompositeOperation = "source-over";

  // If the context supports CSS filter, set it when stamping
  const supportsFilter = "filter" in (ctx as CanvasRenderingContext2D);

  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];

    const dx = b.x - a.x;
    const dy = b.y - a.y;

    // drag offset: negative delta scaled by flow + multiplier
    const ox = -dx * dragMul * flow01;
    const oy = -dy * dragMul * flow01;

    const p = clamp01((a.p + b.p) * 0.5);
    const r = Math.max(0.75, baseRadius * (0.65 + 0.65 * Math.pow(p, 0.8)));
    const alpha = alphaMul * flow01 * (0.6 + 0.4 * p);

    ctx.save();
    if (supportsFilter) {
      (ctx as CanvasRenderingContext2D).filter = `blur(${blurPx.toFixed(3)}px)`;
    }
    ctx.globalAlpha = alpha;

    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2, false);
    ctx.clip();

    // draw source shifted by drag offset (current ctx already DPR-scaled)
    ctx.drawImage(src, -ox, -oy);

    if (supportsFilter) {
      (ctx as CanvasRenderingContext2D).filter = "none";
    }
    ctx.restore();
  }

  ctx.restore();
}

export const backendId = "smudge" as const;

export async function drawSmudgeToCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opt: RenderOptions
): Promise<void> {
  const ctx =
    (canvas.getContext("2d", { alpha: true }) as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null) ?? null;
  if (!ctx) return;
  drawSmudge(ctx as Ctx2D, opt);
}
