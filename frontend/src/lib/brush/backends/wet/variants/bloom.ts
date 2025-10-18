// FILE: src/lib/brush/backends/wet/variants/bloom.ts
import type { RenderOptions, WetOverrides } from "@/lib/brush/engine.types";
import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer } from "@backends/utils/canvas";
import { resample, resolveSpacingFraction } from "../utils/sampling";
import { diffusePass } from "../core/fluid";
import { applyEdgeDarkening } from "../core/edges";
import { paperModel } from "../core/paper";

// Tiny helpers
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const num = (v: unknown, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : d;

/**
 * Backruns/cauliflowers: exaggerate reverse flow near wet borders.
 * We diffuse a stroke mask → build a blurred inward halo → screen it in,
 * then re-darken edges to keep the rim crisp.
 */
export function drawWetBloom(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  if (pts.length < 2) return;

  const W = Math.max(1, Math.floor(opt.width));
  const H = Math.max(1, Math.floor(opt.height));
  const baseSizePx = Math.max(1, num(opt.baseSizePx, 12));
  const color = opt.color ?? "#000000";

  const ov = opt.engine.overrides ?? {};
  const wet = (opt.engine.backendOverrides?.wet ?? {}) as WetOverrides;

  // Composite choice (matches other backends)
  const composite =
    (ov as unknown as { composite?: GlobalCompositeOperation }).composite ??
    opt.engine.rendering?.blendMode ??
    ("source-over" as GlobalCompositeOperation);

  // Sampling spacing
  const spacingUI =
    num(opt.engine.strokePath?.spacing, NaN) ??
    num((ov as { spacing?: number }).spacing, NaN);
  const spacingPercent = Number.isFinite(spacingUI) ? spacingUI : 6;
  const spacingFrac = resolveSpacingFraction(spacingPercent, 6);
  const stepPx = Math.max(0.5, Math.min(2.2, baseSizePx * spacingFrac));

  const samples = resample(pts, stepPx, opt.input);
  if (samples.length < 2) return;

  // Build a soft stroke mask (lighter accumulates alpha)
  const mask = createLayer(W, H);
  {
    const mx = mask.getContext("2d", { alpha: true }) as Ctx2D;
    mx.globalCompositeOperation = "lighter";
    mx.lineCap = "round";
    mx.lineJoin = "round";

    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]!;
      const b = samples[i]!;
      const p = (a.p + b.p) * 0.5; // pressure midpoint
      mx.globalAlpha = 0.35 + 0.55 * Math.pow(clamp01(p), 0.9);
      (mx as CanvasRenderingContext2D).strokeStyle = color;
      mx.lineWidth = Math.max(0.5, baseSizePx * (0.5 + 0.5 * clamp01(p)));
      mx.beginPath();
      mx.moveTo(a.x, a.y);
      mx.lineTo(b.x, b.y);
      mx.stroke();
    }
  }

  // Paper (use sensible fallbacks)
  const paper = paperModel({
    tooth: clamp01(num(wet.paperTooth, 0.45)),
    sizing: clamp01(num(wet.paperSizing, 0.35)),
    granulation: clamp01(num(wet.granulation, 0.35)),
    seed: (opt.seed ?? 11) | 0,
    width: W,
    height: H,
  });

  // Diffuse the stroke mask (slightly restrained so bloom reads clearly)
  const pigment = diffusePass(mask, {
    iterations: Math.max(1, Math.floor(num(wet.iterations, 4))),
    diffusion: Math.max(0, Math.min(2, num(wet.diffusion, 0.9))),
    paper,
  });

  // Create a blurred “inward bloom” halo
  const bloom = createLayer(W, H);
  const bx = bloom.getContext("2d", { alpha: true }) as Ctx2D;
  bx.drawImage(pigment, 0, 0);
  // TS-safe filter write
  (bx as unknown as { filter: string }).filter = "blur(2.2px)";
  bx.drawImage(bloom, 0, 0);
  (bx as unknown as { filter: string }).filter = "none";

  // Screen bloom over pigment (bright watery cauliflower)
  const px = pigment.getContext("2d", { alpha: true }) as Ctx2D;
  px.globalCompositeOperation = "screen";
  px.globalAlpha = clamp01(num(wet.bloomGain, 0.6));
  px.drawImage(bloom, 0, 0);
  px.globalAlpha = 1;
  px.globalCompositeOperation = "source-over";

  // Re-multiply edges for a defined rim
  applyEdgeDarkening(pigment, {
    gain: clamp01(num(wet.edgeGain, 0.8)) * 0.9,
    radiusPx: Math.max(0.25, num(wet.edgeRadiusPx, 1.6)),
    paper,
  });

  // Tint the diffused pigment to stroke color
  const tinted = createLayer(W, H);
  const tx = tinted.getContext("2d", { alpha: true }) as Ctx2D;
  (tx as CanvasRenderingContext2D).fillStyle = color;
  tx.fillRect(0, 0, W, H);
  tx.globalCompositeOperation = "destination-in";
  tx.drawImage(pigment, 0, 0);
  tx.globalCompositeOperation = "source-over";

  // Composite to destination
  ctx.save();
  ctx.globalCompositeOperation = composite;
  ctx.drawImage(tinted, 0, 0);
  ctx.restore();
}
