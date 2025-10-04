import type { RenderOptions } from "@/lib/brush/engine";
import type { Ctx2D } from "../utils/canvas";
import { emitAlongPath, ageToAlpha, type Particle } from "../core/emitters";
import { eulerStep } from "../core/integrators";
import { applyFields } from "../core/fields";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function drawSmoke(ctx: Ctx2D, opt: RenderOptions): void {
  const path = opt.path ?? [];
  if (path.length < 2) return;

  const flow01 = clamp01(
    ((opt.engine.overrides?.flow as number | undefined) ?? 100) / 100
  );
  const opacity01 = clamp01(
    ((opt.engine.overrides?.opacity as number | undefined) ?? 100) / 100
  );

  const rand = (() => {
    let t = (opt.seed ?? 22222) >>> 0;
    return () => (t = (t * 1664525 + 1013904223) >>> 0) / 4294967296;
  })();

  const particles: Particle[] = emitAlongPath(path, {
    rate: 2.0,
    speedPxPerSec: Math.max(30, (opt.baseSizePx ?? 10) * 10),
    lifetimeSec: { min: 0.5, max: 1.2 },
    sizePx: {
      min: Math.max(1, (opt.baseSizePx ?? 8) * 0.25),
      max: Math.max(2, (opt.baseSizePx ?? 8) * 0.45),
    },
    dirJitterRad: 0.8,
    scatterPx: Math.max(
      0,
      (opt.engine.strokePath?.scatter as number | undefined) ?? 2
    ),
    rand,
  });

  const dt = 1 / 60;
  for (const p of particles) {
    for (let s = 0; s < 6; s++) {
      applyFields(p, dt / 6, {
        gravity: { x: 0, y: -10 },
        wind: { x: 15, y: 0 },
        fadePerSec: 0.4,
      });
      eulerStep(p, { dt: dt / 6, drag: 2.0 });
    }
  }

  // soft circles with lower-frequency alpha
  const ctx2d = ctx as CanvasRenderingContext2D;
  ctx2d.save();
  ctx2d.globalCompositeOperation = "lighter";
  ctx2d.fillStyle = "#000000";
  for (const p of particles) {
    const a =
      ageToAlpha(p.age, p.life, "ease") * 0.6 * flow01 * opacity01 * p.alpha;
    if (a <= 0) continue;
    ctx2d.globalAlpha = Math.max(0, Math.min(1, a));
    ctx2d.beginPath();
    ctx2d.arc(p.x, p.y, Math.max(0.5, p.size), 0, Math.PI * 2, false);
    ctx2d.fill();
  }
  ctx2d.restore();
}
