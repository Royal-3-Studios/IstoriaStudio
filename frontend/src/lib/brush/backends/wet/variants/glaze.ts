// FILE: src/lib/brush/backends/wet/variants/glaze.ts
import type { RenderOptions, WetOverrides } from "@/lib/brush/engine.types";
import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer } from "@backends/utils/canvas";
import { resample, resolveSpacingFraction } from "../utils/sampling";
import { diffusePass } from "../core/fluid";
import { paperModel } from "../core/paper";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const num = (v: unknown, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : d;

/** Thin coat over existing pigment — less pooling, more transparency. */
export function drawWetGlaze(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  if (pts.length < 2) return;

  const W = Math.max(1, Math.floor(opt.width));
  const H = Math.max(1, Math.floor(opt.height));
  const baseSizePx = Math.max(1, num(opt.baseSizePx, 10));
  const color = opt.color ?? "#000000";

  const ov = opt.engine.overrides ?? {};
  const wet = (opt.engine.backendOverrides?.wet ?? {}) as WetOverrides;

  // Respect global composite if provided
  const composite =
    (ov as unknown as { composite?: GlobalCompositeOperation }).composite ??
    opt.engine.rendering?.blendMode ??
    ("source-over" as GlobalCompositeOperation);

  // Spacing → step
  const spacingUI =
    num(opt.engine.strokePath?.spacing, NaN) ??
    num((ov as { spacing?: number }).spacing, NaN);
  const spacingPercent = Number.isFinite(spacingUI) ? spacingUI : 8;
  const spacingFrac = resolveSpacingFraction(spacingPercent, 8);
  const stepPx = Math.max(0.5, Math.min(2.4, baseSizePx * spacingFrac));

  const samples = resample(pts, stepPx, opt.input);
  if (samples.length < 2) return;

  // 1) Soft mask of a light, thin application
  const mask = createLayer(W, H);
  {
    const mx = mask.getContext("2d", { alpha: true }) as Ctx2D;
    mx.globalCompositeOperation = "lighter";
    mx.lineCap = "round";
    mx.lineJoin = "round";

    const glazeAlpha = clamp01(num(wet.glazeAlpha, 0.35));
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]!;
      const b = samples[i]!;
      const p = clamp01((a.p + b.p) * 0.5);

      mx.globalAlpha = glazeAlpha * (0.8 + 0.2 * p);
      (mx as CanvasRenderingContext2D).strokeStyle = color;
      mx.lineWidth = Math.max(0.4, baseSizePx * (0.45 + 0.4 * p));

      mx.beginPath();
      mx.moveTo(a.x, a.y);
      mx.lineTo(b.x, b.y);
      mx.stroke();
    }
  }

  // 2) Paper & diffusion (glaze sits more on top: higher sizing, modest diffusion)
  const paper = paperModel({
    tooth: clamp01(num(wet.paperTooth, 0.3)),
    sizing: clamp01(num(wet.paperSizing, 0.55)), // resists soak → thin coat
    granulation: clamp01(num(wet.granulation, 0.15)),
    seed: (opt.seed ?? 9) | 0,
    width: W,
    height: H,
  });

  const pigment = diffusePass(mask, {
    iterations: Math.max(1, Math.floor(num(wet.iterations, 4))),
    diffusion: Math.max(0, Math.min(2, num(wet.diffusion, 0.8))),
    paper,
  });

  // 3) Tint by color & clip to pigment
  const tinted = createLayer(W, H);
  const tx = tinted.getContext("2d", { alpha: true }) as Ctx2D;
  (tx as CanvasRenderingContext2D).fillStyle = color;
  tx.fillRect(0, 0, W, H);
  tx.globalCompositeOperation = "destination-in";
  tx.drawImage(pigment, 0, 0);
  tx.globalCompositeOperation = "source-over";

  // 4) Composite to destination using chosen mode
  ctx.save();
  ctx.globalCompositeOperation = composite;
  ctx.drawImage(tinted, 0, 0);
  ctx.restore();
}
