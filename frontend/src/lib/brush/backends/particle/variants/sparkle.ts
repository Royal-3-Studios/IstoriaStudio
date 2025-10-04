import type { RenderOptions } from "@/lib/brush/engine";
import type { Ctx2D } from "../utils/canvas";
import { emitAlongPath, ageToAlpha, type Particle } from "../core/emitters";
import { eulerStep } from "../core/integrators";
import { applyFields } from "../core/fields";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function drawSparkle(ctx: Ctx2D, opt: RenderOptions): void {
  const path = opt.path ?? [];
  if (path.length < 2) return;

  const flow01 = clamp01(
    ((opt.engine.overrides?.flow as number | undefined) ?? 100) / 100
  );
  const opacity01 = clamp01(
    ((opt.engine.overrides?.opacity as number | undefined) ?? 100) / 100
  );

  const rand = (() => {
    let t = (opt.seed ?? 7777) >>> 0;
    return () => (t = (t * 1664525 + 1013904223) >>> 0) / 4294967296;
  })();

  const particles: Particle[] = emitAlongPath(path, {
    rate: 1.0,
    speedPxPerSec: Math.max(120, (opt.baseSizePx ?? 10) * 28),
    lifetimeSec: { min: 0.15, max: 0.35 },
    sizePx: {
      min: Math.max(0.5, (opt.baseSizePx ?? 8) * 0.12),
      max: Math.max(0.75, (opt.baseSizePx ?? 8) * 0.2),
    },
    dirJitterRad: 0.25,
    scatterPx: Math.max(
      0,
      (opt.engine.strokePath?.scatter as number | undefined) ?? 0
    ),
    rand,
  });

  // quick sim
  const dt = 1 / 60;
  for (const p of particles) {
    for (let s = 0; s < 3; s++) {
      applyFields(p, dt / 3, { gravity: { x: 0, y: 40 }, fadePerSec: 1.2 });
      eulerStep(p, { dt: dt / 3, drag: 0.9 });
    }
  }

  // draw as tiny quads (pixel-ish sparkles)
  const color = opt.color ?? "#000000";
  const ctx2d = ctx as CanvasRenderingContext2D;
  ctx2d.save();
  ctx2d.globalCompositeOperation = "lighter";
  ctx2d.fillStyle = color;

  for (const p of particles) {
    const a =
      ageToAlpha(p.age, p.life, "linear") * 0.9 * flow01 * opacity01 * p.alpha;
    if (a <= 0) continue;
    ctx2d.globalAlpha = Math.max(0, Math.min(1, a));
    const r = Math.max(0.5, p.size);
    ctx2d.fillRect(p.x - r * 0.7, p.y - r * 0.7, r * 1.4, r * 1.4);
  }
  ctx2d.restore();
}
