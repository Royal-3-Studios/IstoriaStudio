// FILE: src/lib/brush/backends/wet/variants/lift.ts
import type { RenderOptions, WetOverrides } from "@/lib/brush/engine.types";
import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer } from "@backends/utils/canvas";
import { resample, resolveSpacingFraction } from "../utils/sampling";
import { applyLift } from "../core/lift";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const num = (v: unknown, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : d;

/** Clean-water lifting: subtract pigment along the path. */
export function drawWetLift(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  if (pts.length < 2) return;

  const W = Math.max(1, Math.floor(opt.width));
  const H = Math.max(1, Math.floor(opt.height));
  const baseSizePx = Math.max(1, num(opt.baseSizePx, 10));

  const ov = opt.engine.overrides ?? {};
  const wet = (opt.engine.backendOverrides?.wet ?? {}) as WetOverrides;

  // Spacing → step
  const spacingUI =
    num(opt.engine.strokePath?.spacing, NaN) ??
    num((ov as { spacing?: number }).spacing, NaN);
  const spacingPercent = Number.isFinite(spacingUI) ? spacingUI : 6;
  const spacingFrac = resolveSpacingFraction(spacingPercent, 6);
  const stepPx = Math.max(0.5, Math.min(2.2, baseSizePx * spacingFrac));

  const samples = resample(pts, stepPx, opt.input);
  if (samples.length < 2) return;

  // 1) Build an alpha-only “water” mask along the stroke
  const water = createLayer(W, H);
  {
    const wx = water.getContext("2d", { alpha: true }) as Ctx2D;
    wx.globalCompositeOperation = "lighter";
    wx.lineCap = "round";
    wx.lineJoin = "round";

    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]!;
      const b = samples[i]!;
      const p = clamp01((a.p + b.p) * 0.5);

      wx.globalAlpha = 0.4 + 0.5 * Math.pow(p, 0.9);
      (wx as CanvasRenderingContext2D).strokeStyle = "#fff"; // alpha-only
      wx.lineWidth = Math.max(0.5, baseSizePx * (0.55 + 0.55 * p));

      wx.beginPath();
      wx.moveTo(a.x, a.y);
      wx.lineTo(b.x, b.y);
      wx.stroke();
    }
  }

  // 2) Slight blur to soften the lift edge (guard `filter` on some contexts)
  const wctx = water.getContext("2d", { alpha: true }) as Ctx2D;
  try {
    (wctx as unknown as { filter: string }).filter = "blur(1.2px)";
    wctx.drawImage(water, 0, 0);
    (wctx as unknown as { filter: string }).filter = "none";
  } catch {
    // If `filter` unsupported, skip blur—still functional.
  }

  // 3) Lift from the destination canvas:
  //    We snapshot → applyLift(snapshot, water, strength) → blit back.
  const tmp = createLayer(W, H);
  const tx = tmp.getContext("2d", { alpha: true }) as Ctx2D;
  tx.drawImage(ctx.canvas as HTMLCanvasElement, 0, 0);

  const strength = clamp01(num(wet.liftStrength, 0.6));
  applyLift(tmp, water, strength);

  // 4) Replace destination with lifted result
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();
}
