// FILE: src/lib/brush/backends/particle.ts
/**
 * Particle backend (stub, production-ready shape)
 *
 * Purpose: procedural brushes (grass, leaves, fur, sparkles, etc.).
 * Strategy: spawn lightweight particles per stamp; each particle draws
 * a tiny textured sprite with lifespan and random walk.
 */

import type { RenderOptions } from "@/lib/brush/engine";

export type ParticleOptions = RenderOptions & {
  // future: per-preset particle controls
};

function seededRng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function drawParticle(
  ctx: CanvasRenderingContext2D,
  opt: ParticleOptions
) {
  const pr = Math.max(1, Math.min(4, opt.pixelRatio ?? 2));
  const D = Math.max(1, opt.baseSizePx * (opt.engine.shape?.sizeScale ?? 1));
  const R = D * 0.5;
  const path = opt.path ?? [];
  if (path.length < 2) return;

  const rng = seededRng(opt.seed ?? 42);
  const count = Math.max(1, Math.round(opt.overrides?.count ?? 12));
  const scatter = opt.overrides?.scatter ?? 4;

  ctx.save();
  ctx.globalAlpha = (opt.overrides?.flow ?? 100) / 100;

  for (let i = 1; i < path.length; i++) {
    const p = path[i];
    for (let k = 0; k < count; k++) {
      const ang = rng() * Math.PI * 2;
      const rad = rng() * scatter + R * 0.1;
      const x = p.x + Math.cos(ang) * rad;
      const y = p.y + Math.sin(ang) * rad;
      const s = Math.max(0.5, R * (0.2 + rng() * 0.3));

      // simple soft dot sprite
      const off = document.createElement("canvas");
      off.width = Math.ceil(s * 2 * pr);
      off.height = Math.ceil(s * 2 * pr);
      const octx = off.getContext("2d")!;
      octx.setTransform(pr, 0, 0, pr, 0, 0);
      octx.translate(s, s);
      const g = octx.createRadialGradient(0, 0, 0, 0, 0, s);
      g.addColorStop(0, "rgba(0,0,0,0.35)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      octx.fillStyle = g;
      octx.beginPath();
      octx.arc(0, 0, s, 0, Math.PI * 2);
      octx.fill();

      ctx.drawImage(off, (x - s) * pr, (y - s) * pr);
    }
  }

  ctx.restore();
}

export const backendId2 = "particle" as const;
export default drawParticle;
