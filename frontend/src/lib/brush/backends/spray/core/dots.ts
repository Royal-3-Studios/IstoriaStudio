// src/lib/brush/backends/spray/core/dots.ts
import type { Ctx2D } from "@backends/utils/canvas";

/** standard gaussian radius jitter (Box–Muller) */
export function gaussianRadius(baseR: number, rnd: () => number): number {
  const u = Math.max(1e-6, rnd());
  const v = Math.max(1e-6, rnd());
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  const k = 0.35;
  return Math.max(0.1, baseR * (1 + k * z));
}

export function paintDot(
  ctx: Ctx2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  alpha: number
): void {
  if (r <= 0 || alpha <= 0) return;
  (ctx as unknown as { fillStyle: string }).fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}
