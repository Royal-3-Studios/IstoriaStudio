// FILE: src/lib/brush/backends/wet/variants/wash.ts
import type { RenderOptions, WetOverrides } from "@/lib/brush/engine.types";
import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer } from "@backends/utils/canvas";
import { resample, resolveSpacingFraction } from "../utils/sampling";
import { diffusePass, poolPass } from "../core/fluid";
import { applyEdgeDarkening } from "../core/edges";
import { paperModel } from "../core/paper";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const num = (v: unknown, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : d;

export function drawWetWash(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  if (pts.length < 2) return;

  const W = Math.max(1, Math.floor(opt.width));
  const H = Math.max(1, Math.floor(opt.height));
  const baseSizePx = Math.max(1, num(opt.baseSizePx, 10));
  const color = opt.color ?? "#000";

  const ov = opt.engine.overrides ?? {};
  const wet = (opt.engine.backendOverrides?.wet ?? {}) as WetOverrides;

  // Spacing → step (respect engine.strokePath first, then overrides, fallback)
  const spacingUI =
    num(opt.engine.strokePath?.spacing, NaN) ??
    num((ov as { spacing?: number }).spacing, NaN);
  const spacingPercent = Number.isFinite(spacingUI) ? spacingUI : 6;
  const spacingFrac = resolveSpacingFraction(spacingPercent, 6);
  const stepPx = Math.max(0.5, Math.min(2.2, baseSizePx * spacingFrac));

  const samples = resample(pts, stepPx, opt.input);
  if (samples.length < 2) return;

  // 1) Build a water/pigment mask from the path
  const mask = createLayer(W, H);
  {
    const mx = mask.getContext("2d", { alpha: true }) as Ctx2D;
    mx.globalCompositeOperation = "lighter";
    mx.lineCap = "round";
    mx.lineJoin = "round";
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]!;
      const b = samples[i]!;
      const p = clamp01((a.p + b.p) * 0.5);
      mx.globalAlpha = 0.25 + 0.55 * Math.pow(p, 0.9);
      (mx as CanvasRenderingContext2D).strokeStyle = color;
      mx.lineWidth = Math.max(0.5, baseSizePx * (0.5 + 0.5 * p));
      mx.beginPath();
      mx.moveTo(a.x, a.y);
      mx.lineTo(b.x, b.y);
      mx.stroke();
    }
  }

  // 2) Paper model
  const paper = paperModel({
    tooth: num(wet.paperTooth, 0.35),
    sizing: num(wet.paperSizing, 0.4),
    granulation: num(wet.granulation, 0.2),
    seed: num(opt.seed, 7),
    width: W,
    height: H,
  });

  // 3) Diffusion + pooling (clamped)
  const iterations = Math.max(1, Math.min(24, num(wet.iterations, 6)));
  const diffusion = Math.max(0, Math.min(2, num(wet.diffusion, 1.0)));
  const pooling = Math.max(0, Math.min(2, num(wet.pooling, 0.6)));

  const pigment = diffusePass(mask, {
    iterations,
    diffusion,
    paper,
  });
  poolPass(pigment, { amount: pooling, paper });

  // 4) Edges (default on unless explicitly false)
  if ((wet.wetEdges ?? true) === true) {
    const gain = num(wet.edgeGain, 0.6);
    const radiusPx = num(wet.edgeRadiusPx, 1.2);
    applyEdgeDarkening(pigment, { gain, radiusPx, paper });
  }

  // 5) Tint & clip by mask
  const tinted = createLayer(W, H);
  {
    const tx = tinted.getContext("2d", { alpha: true }) as Ctx2D;
    (tx as CanvasRenderingContext2D).fillStyle = color;
    tx.fillRect(0, 0, W, H);
    tx.globalCompositeOperation = "destination-in";
    tx.drawImage(pigment, 0, 0);
    tx.globalCompositeOperation = "source-over";
  }

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(tinted, 0, 0);
  ctx.restore();
}
