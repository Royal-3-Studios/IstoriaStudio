import type { RenderOptions, WetOverrides } from "@/lib/brush/engine.types";
import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer } from "@backends/utils/canvas";
import { resample, resolveSpacingFraction } from "../utils/sampling";
import { applyLift } from "../core/lift";

/** Clean-water lifting: subtract pigment along the path. */
export function drawWetLift(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  if (pts.length < 2) return;

  const w = Math.max(1, Math.floor(opt.width));
  const h = Math.max(1, Math.floor(opt.height));
  const baseSizePx = Math.max(1, opt.baseSizePx || 10);

  const ov = opt.engine.overrides ?? {};
  const wet = (opt.engine.backendOverrides?.wet ?? {}) as WetOverrides;

  const spacingUI = opt.engine.strokePath?.spacing ?? ov.spacing ?? 6;
  const spacingFrac = resolveSpacingFraction(spacingUI, 6);
  const stepPx = Math.max(0.5, Math.min(2.2, baseSizePx * spacingFrac));
  const samples = resample(pts, stepPx, opt.input);
  if (samples.length < 2) return;

  // Build a water mask (alpha only)
  const water = createLayer(w, h);
  {
    const wx = water.getContext("2d", { alpha: true }) as Ctx2D;
    wx.globalCompositeOperation = "lighter";
    wx.lineCap = "round";
    wx.lineJoin = "round";
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]!,
        b = samples[i]!;
      const p = (a.p + b.p) * 0.5;
      wx.globalAlpha = 0.4 + 0.5 * Math.pow(p, 0.9);
      wx.strokeStyle = "rgba(255,255,255,1)"; // only alpha matters
      wx.lineWidth = Math.max(0.5, baseSizePx * (0.55 + 0.55 * p));
      wx.beginPath();
      wx.moveTo(a.x, a.y);
      wx.lineTo(b.x, b.y);
      wx.stroke();
    }
  }

  // Blur slightly to soften lift boundary
  const wctx = water.getContext("2d", { alpha: true }) as Ctx2D;
  (wctx as unknown as { filter: string }).filter = "blur(1.2px)";
  wctx.drawImage(water, 0, 0);
  (wctx as unknown as { filter: string }).filter = "none";

  // Lift from the destination canvas directly
  // (We need a temp copy since we're drawing to the same ctx)
  const snapshot = ctx.canvas;
  const tmp = createLayer(w, h);
  const tx = tmp.getContext("2d", { alpha: true }) as Ctx2D;
  tx.drawImage(snapshot, 0, 0);

  applyLift(tmp, water, Math.max(0, Math.min(1, wet.liftStrength ?? 0.6)));

  // Blit back
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(tmp, 0, 0);
}
