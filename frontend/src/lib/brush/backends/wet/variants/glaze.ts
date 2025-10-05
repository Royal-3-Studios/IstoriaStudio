import type { RenderOptions, WetOverrides } from "@/lib/brush/engine.types";
import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer } from "@backends/utils/canvas";
import { resample, resolveSpacingFraction } from "../utils/sampling";
import { diffusePass } from "../core/fluid";
import { paperModel } from "../core/paper";

/** Thin coat over existing pigment — less pooling, more transparency. */
export function drawWetGlaze(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  if (pts.length < 2) return;

  const w = Math.max(1, Math.floor(opt.width));
  const h = Math.max(1, Math.floor(opt.height));
  const baseSizePx = Math.max(1, opt.baseSizePx || 10);
  const color = opt.color ?? "#000";

  const ov = opt.engine.overrides ?? {};
  const wet = (opt.engine.backendOverrides?.wet ?? {}) as WetOverrides;

  const spacingUI = opt.engine.strokePath?.spacing ?? ov.spacing ?? 8;
  const spacingFrac = resolveSpacingFraction(spacingUI, 8);
  const stepPx = Math.max(0.5, Math.min(2.4, baseSizePx * spacingFrac));
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
      mx.globalAlpha = (wet.glazeAlpha ?? 0.35) * (0.8 + 0.2 * p);
      mx.strokeStyle = color;
      mx.lineWidth = Math.max(0.4, baseSizePx * (0.45 + 0.4 * p));
      mx.beginPath();
      mx.moveTo(a.x, a.y);
      mx.lineTo(b.x, b.y);
      mx.stroke();
    }
  }

  const paper = paperModel({
    tooth: wet.paperTooth ?? 0.3,
    sizing: wet.paperSizing ?? 0.55, // more resistant: thin glaze sits on top
    granulation: wet.granulation ?? 0.15,
    seed: opt.seed ?? 9,
    width: w,
    height: h,
  });

  const pigment = diffusePass(mask, {
    iterations: Math.max(1, wet.iterations ?? 4),
    diffusion: Math.max(0, Math.min(2, wet.diffusion ?? 0.8)),
    paper,
  });

  // Simple tint & clip (we don’t emphasize edges for a glaze)
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
