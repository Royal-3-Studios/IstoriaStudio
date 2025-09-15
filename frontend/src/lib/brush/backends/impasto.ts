// FILE: src/lib/brush/backends/impasto.ts
/**
 * Impasto/Thick Paint backend (stub)
 *
 * Purpose: simulate raised paint with lighting (normal + height + shading).
 * Strategy: this stub renders a color pass plus a cheap faux-light pass so the
 * wiring is done. Later you can replace with a real height/normal pipeline.
 */

import type { RenderOptions } from "@/lib/brush/engine";

export type ImpastoOptions = RenderOptions & {
  lightDir?: { x: number; y: number }; // unit vector
  lightStrength?: number; // 0..1
};

export function drawImpasto(
  ctx: CanvasRenderingContext2D,
  opt: ImpastoOptions
) {
  const D = Math.max(1, opt.baseSizePx * (opt.engine.shape?.sizeScale ?? 1));
  const R = D * 0.5;
  const path = opt.path ?? [];
  if (path.length < 2) return;

  const light = opt.lightDir ?? { x: -0.5, y: -0.6 };
  const L = Math.hypot(light.x, light.y) || 1;
  const lx = light.x / L;
  const ly = light.y / L;
  const strength = Math.max(0, Math.min(1, opt.lightStrength ?? 0.6));

  for (let i = 1; i < path.length; i++) {
    const p = path[i];

    // Base color blob
    ctx.save();
    ctx.translate(p.x, p.y);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, "rgba(0,0,0,0.22)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();

    // Faux specular highlight in light direction
    ctx.globalCompositeOperation = "screen";
    const hx = lx * R * 0.5;
    const hy = ly * R * 0.5;
    const h = ctx.createRadialGradient(hx, hy, 0, hx, hy, R * 0.9);
    h.addColorStop(0, `rgba(255,255,255,${0.25 * strength})`);
    h.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = h;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export const backendId4 = "impasto" as const;
export default drawImpasto;
