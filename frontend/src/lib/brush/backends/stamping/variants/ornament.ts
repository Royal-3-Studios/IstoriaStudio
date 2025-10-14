// FILE: src/lib/brush/backends/stamping/variants/ornament.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import type { Ctx2D } from "@backends/utils/canvas";
import { clamp01 } from "@backends/utils/color";
import { trackOffsets } from "../core/tracks";
import {
  resampleWithAngle,
  spacingToStepPx,
  type SamplePoint,
} from "../core/resample";

export function drawStampOrnament(ctx: Ctx2D, opt: RenderOptions): void {
  const path = opt.path ?? [];
  if (path.length < 2) return;

  const color = opt.color ?? "#000000";
  const opacity01 = clamp01(
    ((opt.engine.overrides?.opacity as number | undefined) ?? 100) / 100
  );
  const baseR = Math.max(0.5, (opt.baseSizePx ?? 12) * 0.5);

  const stepPx = spacingToStepPx(opt, baseR);
  const samples: SamplePoint[] = resampleWithAngle(path, stepPx);
  if (samples.length < 2) return;

  const fan = {
    count: 3,
    spreadPx: Math.max(3, baseR * 0.9),
    curvature: 0.12,
    asymmetry: 0,
  } as const;

  ctx.save();
  ctx.globalAlpha = opacity01;
  (ctx as CanvasRenderingContext2D).fillStyle = color;

  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const tMid = 0.5 * (a.t + b.t);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const nx = -Math.sin(ang),
      ny = Math.cos(ang);
    const offs = trackOffsets(tMid, fan);

    for (const d of offs) {
      const cx = (a.x + b.x) * 0.5 + nx * d;
      const cy = (a.y + b.y) * 0.5 + ny * d;
      const r = Math.max(1, baseR * 0.45);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2, false);
      ctx.fill();
    }
  }

  ctx.restore();
}
