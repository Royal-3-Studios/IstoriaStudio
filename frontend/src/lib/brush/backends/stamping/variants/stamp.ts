// FILE: src/lib/brush/backends/stamping/variants/stamp.ts
import type { RenderOptions } from "@/lib/brush/engine";
import type { Ctx2D } from "../utils/canvas";
import { clamp01 } from "../utils/color";

/** Example: draw one stamp at the last path point (placeholder for textured stamps). */
export function drawSingleStamp(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  if (pts.length === 0) return;

  const p = pts[pts.length - 1]!;
  const color = opt.color ?? "#000000";
  const opacity01 = clamp01(
    ((opt.engine.overrides?.opacity as number | undefined) ?? 100) / 100
  );

  ctx.save();
  ctx.globalAlpha = opacity01;
  (ctx as CanvasRenderingContext2D).fillStyle = color;
  const r = Math.max(1, (opt.baseSizePx ?? 8) * 0.5);
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2, false);
  ctx.fill();
  ctx.restore();
}
