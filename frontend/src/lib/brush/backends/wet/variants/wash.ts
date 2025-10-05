import type { RenderOptions, WetOverrides } from "@/lib/brush/engine.types";
import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer } from "@backends/utils/canvas";
import { resample, resolveSpacingFraction } from "../utils/sampling";
import { diffusePass, poolPass } from "../core/fluid";
import { applyEdgeDarkening } from "../core/edges";
import { paperModel } from "../core/paper";

export function drawWetWash(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  if (pts.length < 2) return;

  const w = Math.max(1, Math.floor(opt.width));
  const h = Math.max(1, Math.floor(opt.height));
  const baseSizePx = Math.max(1, opt.baseSizePx || 10);
  const color = opt.color ?? "#000";

  const ov = opt.engine.overrides ?? {};
  const wet = (opt.engine.backendOverrides?.wet ?? {}) as WetOverrides;

  const spacingUI = opt.engine.strokePath?.spacing ?? ov.spacing ?? 6;
  const spacingFrac = resolveSpacingFraction(spacingUI, 6);
  const stepPx = Math.max(0.5, Math.min(2.2, baseSizePx * spacingFrac));
  const samples = resample(pts, stepPx, opt.input);
  if (samples.length < 2) return;

  // 1) Build a water/pigment mask from the path
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
      mx.globalAlpha = 0.25 + 0.55 * Math.pow(p, 0.9);
      mx.strokeStyle = color;
      mx.lineWidth = Math.max(0.5, baseSizePx * (0.5 + 0.5 * p));
      mx.beginPath();
      mx.moveTo(a.x, a.y);
      mx.lineTo(b.x, b.y);
      mx.stroke();
    }
  }

  // 2) Paper model
  const paper = paperModel({
    tooth: wet.paperTooth ?? 0.35,
    sizing: wet.paperSizing ?? 0.4,
    granulation: wet.granulation ?? 0.2,
    seed: opt.seed ?? 7,
    width: w,
    height: h,
  });

  // 3) Diffusion + pooling
  const iter = Math.max(1, Math.min(24, wet.iterations ?? 6));
  const diff = Math.max(0, Math.min(2, wet.diffusion ?? 1.0));
  const pool = Math.max(0, Math.min(2, wet.pooling ?? 0.6));
  const pigment = diffusePass(mask, {
    iterations: iter,
    diffusion: diff,
    paper,
  });
  poolPass(pigment, { amount: pool, paper });

  // 4) Edges
  if (wet.wetEdges ?? true) {
    const gain = wet.edgeGain ?? 0.6;
    const radiusPx = wet.edgeRadiusPx ?? 1.2;
    applyEdgeDarkening(pigment, { gain, radiusPx, paper });
  }

  // 5) Tint & clip by mask
  const tinted = createLayer(w, h);
  {
    const tx = tinted.getContext("2d", { alpha: true }) as Ctx2D;
    tx.fillStyle = color;
    tx.fillRect(0, 0, w, h);
    tx.globalCompositeOperation = "destination-in";
    tx.drawImage(pigment, 0, 0);
    tx.globalCompositeOperation = "source-over";
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(tinted, 0, 0);
}
