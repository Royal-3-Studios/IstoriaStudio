import type { RenderOptions, WetOverrides } from "@/lib/brush/engine.types";
import type { Ctx2D } from "../utils/canvas";
import { createLayer } from "../utils/canvas";
import { resample, resolveSpacingFraction } from "../utils/sampling";
import { diffusePass } from "../core/fluid";
import { applyEdgeDarkening } from "../core/edges";
import { paperModel } from "../core/paper";

/** Emphasize capillary edge darkening around a wet stroke. */
export function drawWetEdge(ctx: Ctx2D, opt: RenderOptions): void {
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
      mx.lineWidth = Math.max(0.6, baseSizePx * (0.55 + 0.6 * p));
      mx.beginPath();
      mx.moveTo(a.x, a.y);
      mx.lineTo(b.x, b.y);
      mx.stroke();
    }
  }

  const paper = paperModel({
    tooth: wet.paperTooth ?? 0.4,
    sizing: wet.paperSizing ?? 0.35,
    granulation: wet.granulation ?? 0.25,
    seed: opt.seed ?? 5,
    width: w,
    height: h,
  });

  const pigment = diffusePass(mask, {
    iterations: Math.max(1, wet.iterations ?? 5),
    diffusion: Math.max(0, Math.min(2, wet.diffusion ?? 1.0)),
    paper,
  });
  applyEdgeDarkening(pigment, {
    gain: wet.edgeGain ?? 1.0,
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
