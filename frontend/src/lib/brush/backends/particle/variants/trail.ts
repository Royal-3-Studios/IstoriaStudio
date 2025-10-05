import type { RenderOptions } from "@/lib/brush/engine";
import type { Ctx2D } from "@backends/utils/canvas";
import { emitAlongPath, ageToAlpha, type Particle } from "../core/emitters";
import { eulerStep } from "../core/integrators";
import { applyFields } from "../core/fields";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function drawTrail(ctx: Ctx2D, opt: RenderOptions): void {
  const path = opt.path ?? [];
  if (path.length < 2) return;

  const flow01 = clamp01(
    ((opt.engine.overrides?.flow as number | undefined) ?? 100) / 100
  );
  const opacity01 = clamp01(
    ((opt.engine.overrides?.opacity as number | undefined) ?? 100) / 100
  );

  // Seed a tiny burst per point; trail variant = modest speed + longer life
  const rand = (() => {
    let t = (opt.seed ?? 12345) >>> 0;
    return () => (t = (t * 1664525 + 1013904223) >>> 0) / 4294967296;
  })();

  const particles: Particle[] = emitAlongPath(path, {
    rate: 1.5,
    speedPxPerSec: Math.max(50, (opt.baseSizePx ?? 10) * 20),
    lifetimeSec: { min: 0.25, max: 0.5 },
    sizePx: {
      min: Math.max(0.5, (opt.baseSizePx ?? 8) * 0.15),
      max: Math.max(1, (opt.baseSizePx ?? 8) * 0.25),
    },
    dirJitterRad: 0.35,
    scatterPx: (opt.engine.strokePath?.scatter as number | undefined) ?? 0,
    rand,
  });

  // Single quick sim pass ~16ms (this renderer is “instant”, not persistent)
  const dt = 1 / 60;
  for (const p of particles) {
    // 4 mini-steps for a bit of continuity
    for (let s = 0; s < 4; s++) {
      applyFields(p, dt / 4, { gravity: { x: 0, y: 50 }, fadePerSec: 0 }); // slight gravity
      eulerStep(p, { dt: dt / 4, drag: 1.5 });
    }
  }

  // Draw as simple round sprites
  const color = opt.color ?? "#000000";
  const ctx2d = ctx as CanvasRenderingContext2D;
  ctx2d.save();
  ctx2d.globalCompositeOperation = "source-over";
  ctx2d.fillStyle = color;

  for (const p of particles) {
    const a = ageToAlpha(p.age, p.life, "ease") * flow01 * opacity01 * p.alpha;
    if (a <= 0) continue;
    ctx2d.globalAlpha = Math.max(0, Math.min(1, a));
    ctx2d.beginPath();
    ctx2d.arc(p.x, p.y, Math.max(0.5, p.size), 0, Math.PI * 2, false);
    ctx2d.fill();
  }
  ctx2d.restore();
}
