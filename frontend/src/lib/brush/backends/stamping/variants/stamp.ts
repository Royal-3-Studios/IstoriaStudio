// FILE: src/lib/brush/backends/stamping/variants/stamp.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import type { Ctx2D } from "@backends/utils/canvas";
import { clamp01 } from "@backends/utils/color";

/** Draw one stamp at the last path point (tilt-aware ellipse via transforms). */
export function drawSingleStamp(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  if (pts.length === 0) return;

  const p = pts[pts.length - 1]!;
  const ov = opt.engine.overrides ?? {};

  const color = opt.color ?? "#000000";
  const opacity01 = clamp01(((ov.opacity as number | undefined) ?? 100) / 100);

  const baseR = Math.max(0.5, (opt.baseSizePx ?? 8) * 0.5);

  const tilt01 = clamp01((p as { tilt?: number }).tilt ?? 0);
  const tiltToSize = ov.tiltToSize ?? 0; // 0..1
  const tiltToFan = ov.tiltToFan ?? 0; // 0..1

  // Orientation: prefer per-point angle; else derive from last segment
  const lastAngle =
    typeof (p as { angle?: number }).angle === "number"
      ? (p as { angle?: number }).angle!
      : pts.length >= 2
        ? Math.atan2(p.y - pts[pts.length - 2]!.y, p.x - pts[pts.length - 2]!.x)
        : 0;

  // Size & fan
  const sizeMul = 1 + clamp01(tiltToSize) * tilt01;
  const fan = 1 + clamp01(tiltToFan) * tilt01; // >1 => flatter/longer ellipse

  const major = baseR * sizeMul * fan; // along nib axis
  const minor = Math.max(0.5, (baseR * sizeMul) / fan); // orthogonal

  ctx.save();
  ctx.globalAlpha = opacity01;
  (ctx as CanvasRenderingContext2D).fillStyle = color;

  // Use transforms so we don't rely on ctx.ellipse (avoids TS narrowing issues)
  ctx.translate(p.x, p.y);
  ctx.rotate(lastAngle);
  ctx.scale(major / baseR, minor / baseR);

  ctx.beginPath();
  ctx.arc(0, 0, baseR, 0, Math.PI * 2, false);
  ctx.fill();

  ctx.restore();
}
