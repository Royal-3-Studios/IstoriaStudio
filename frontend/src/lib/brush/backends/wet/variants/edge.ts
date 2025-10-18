// FILE: src/lib/brush/backends/wet/variants/edge.ts
import type { RenderOptions, WetOverrides } from "@/lib/brush/engine.types";
import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer } from "@backends/utils/canvas";
import { resample, resolveSpacingFraction } from "../utils/sampling";
import { diffusePass } from "../core/fluid";
import { applyEdgeDarkening } from "../core/edges";
import { paperModel } from "../core/paper";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const num = (v: unknown, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : d;

/** Emphasize capillary edge darkening around a wet stroke. */
export function drawWetEdge(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  if (pts.length < 2) return;

  const W = Math.max(1, Math.floor(opt.width));
  const H = Math.max(1, Math.floor(opt.height));
  const baseSizePx = Math.max(1, num(opt.baseSizePx, 12));
  const color = opt.color ?? "#000000";

  const ov = opt.engine.overrides ?? {};
  const wet = (opt.engine.backendOverrides?.wet ?? {}) as WetOverrides;

  // Respect global composite choice (overrides.composite > rendering.blendMode > source-over)
  const composite =
    (ov as unknown as { composite?: GlobalCompositeOperation }).composite ??
    opt.engine.rendering?.blendMode ??
    ("source-over" as GlobalCompositeOperation);

  // Spacing → step (same policy used elsewhere)
  const spacingUI =
    num(opt.engine.strokePath?.spacing, NaN) ??
    num((ov as { spacing?: number }).spacing, NaN);
  const spacingPercent = Number.isFinite(spacingUI) ? spacingUI : 6;
  const spacingFrac = resolveSpacingFraction(spacingPercent, 6);
  const stepPx = Math.max(0.5, Math.min(2.2, baseSizePx * spacingFrac));

  const samples = resample(pts, stepPx, opt.input);
  if (samples.length < 2) return;

  // 1) Soft mask of the stroke
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

      mx.globalAlpha = 0.35 + 0.55 * Math.pow(p, 0.9);
      (mx as CanvasRenderingContext2D).strokeStyle = color;
      mx.lineWidth = Math.max(0.6, baseSizePx * (0.55 + 0.6 * p));

      mx.beginPath();
      mx.moveTo(a.x, a.y);
      mx.lineTo(b.x, b.y);
      mx.stroke();
    }
  }

  // 2) Paper & diffusion
  const paper = paperModel({
    tooth: clamp01(num(wet.paperTooth, 0.4)),
    sizing: clamp01(num(wet.paperSizing, 0.35)),
    granulation: clamp01(num(wet.granulation, 0.25)),
    seed: (opt.seed ?? 5) | 0,
    width: W,
    height: H,
  });

  const pigment = diffusePass(mask, {
    iterations: Math.max(1, Math.floor(num(wet.iterations, 5))),
    diffusion: Math.max(0, Math.min(2, num(wet.diffusion, 1.0))),
    paper,
  });

  // 3) Edge darkening (the key look)
  applyEdgeDarkening(pigment, {
    gain: clamp01(num(wet.edgeGain, 1.0)),
    radiusPx: Math.max(0.25, num(wet.edgeRadiusPx, 1.6)),
    paper,
  });

  // 4) Tint to stroke color
  const tinted = createLayer(W, H);
  const tx = tinted.getContext("2d", { alpha: true }) as Ctx2D;
  (tx as CanvasRenderingContext2D).fillStyle = color;
  tx.fillRect(0, 0, W, H);
  tx.globalCompositeOperation = "destination-in";
  tx.drawImage(pigment, 0, 0);
  tx.globalCompositeOperation = "source-over";

  // 5) Composite to destination
  ctx.save();
  ctx.globalCompositeOperation = composite;
  ctx.drawImage(tinted, 0, 0);
  ctx.restore();
}
