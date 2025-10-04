import type { RenderOptions, WetOverrides } from "@/lib/brush/engine.types";
import type { Ctx2D } from "../utils/canvas";
import { createLayer } from "../utils/canvas";
import { resample, resolveSpacingFraction } from "../utils/sampling";
import { diffusePass } from "../core/fluid";
import { applyEdgeDarkening } from "../core/edges";
import { paperModel } from "../core/paper";

/**
 * Backruns/cauliflowers: exaggerate reverse flow near wet borders.
 * Implemented here by pushing a stronger blurred edge back onto the core
 * in screen mode, then re-multiplying edges to keep the rim pronounced.
 */
export function drawWetBloom(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  if (pts.length < 2) return;

  const w = Math.max(1, Math.floor(opt.width));
  const h = Math.max(1, Math.floor(opt.height));
  const baseSizePx = Math.max(1, opt.baseSizePx || 12);
  const color = opt.color ?? "#000";

  const ov = opt.engine.overrides ?? {};
  const wet = (opt.engine.backendOverrides?.wet ?? {}) as WetOverrides;

  const spacingUI = opt.engine.strokePath?.spacing ?? ov.spacing ?? 6;
  const spacingFrac = resolveSpacingFraction(spacingUI, 6);
  const stepPx = Math.max(0.5, Math.min(2.2, baseSizePx * spacingFrac));
  const samples = resample(pts, stepPx, opt.input);
  if (samples.length < 2) return;

  const mask = createLayer(w, h);
  {
    const mx = mask.getContext("2d", { alpha: true }) as Ctx2D;
    mx.globalCompositeOperation = "lighter";
    mx.lineCap = "round";
    mx.lineJoin = "round";
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]!,
        b = samples[i]!;
      const p = (a.p + b.p) * 0.5;
      mx.globalAlpha = 0.35 + 0.55 * Math.pow(p, 0.9);
      mx.strokeStyle = color;
      mx.lineWidth = Math.max(0.5, baseSizePx * (0.5 + 0.5 * p));
      mx.beginPath();
      mx.moveTo(a.x, a.y);
      mx.lineTo(b.x, b.y);
      mx.stroke();
    }
  }

  const paper = paperModel({
    tooth: wet.paperTooth ?? 0.45,
    sizing: wet.paperSizing ?? 0.35,
    granulation: wet.granulation ?? 0.35,
    seed: opt.seed ?? 11,
    width: w,
    height: h,
  });

  // diffuse a bit less so the bloom stands out
  const pigment = diffusePass(mask, {
    iterations: Math.max(1, wet.iterations ?? 4),
    diffusion: Math.max(0, Math.min(2, wet.diffusion ?? 0.9)),
    paper,
  });

  // Create an "inward bloom" halo
  const bloom = createLayer(w, h);
  const bx = bloom.getContext("2d", { alpha: true }) as Ctx2D;
  bx.drawImage(pigment, 0, 0);
  (bx as unknown as { filter: string }).filter = "blur(2.2px)";
  bx.drawImage(bloom, 0, 0);
  (bx as unknown as { filter: string }).filter = "none";

  // Screen bloom over pigment (bright watery cauliflowers)
  const px = pigment.getContext("2d", { alpha: true }) as Ctx2D;
  px.globalCompositeOperation = "screen";
  px.globalAlpha = Math.max(0, Math.min(1, wet.bloomGain ?? 0.6));
  px.drawImage(bloom, 0, 0);
  px.globalAlpha = 1;
  px.globalCompositeOperation = "source-over";

  // Re-multiply edges to keep rim definition
  applyEdgeDarkening(pigment, {
    gain: (wet.edgeGain ?? 0.8) * 0.9,
    radiusPx: wet.edgeRadiusPx ?? 1.6,
    paper,
  });

  const tinted = createLayer(w, h);
  const tx = tinted.getContext("2d", { alpha: true }) as Ctx2D;
  tx.fillStyle = color;
  tx.fillRect(0, 0, w, h);
  tx.globalCompositeOperation = "destination-in";
  tx.drawImage(pigment, 0, 0);
  tx.globalCompositeOperation = "source-over";

  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(tinted, 0, 0);
}
