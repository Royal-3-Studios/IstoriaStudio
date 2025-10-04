// src/lib/brush/backends/spray/core/droplet.ts
// FILE: src/lib/brush/backends/spray/core/droplet.ts

export type DropletShape = "circle" | "ellipse";

/** Box–Muller Gaussian jitter for radius. */
export function gaussianRadius(
  baseR: number,
  rnd: () => number,
  k = 0.35
): number {
  const u = Math.max(1e-6, rnd());
  const v = Math.max(1e-6, rnd());
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(0.1, baseR * (1 + k * z));
}

export type Droplet = {
  x: number;
  y: number;
  radius: number; // for circle or major radius for ellipse
  alpha: number; // 0..1
  color: string; // CSS color
  shape?: DropletShape;
  aspect?: number; // ellipse minor/major, 0..1 (1 = circle)
  angleDeg?: number;
};

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Circle (fast path). */
export function paintCircleDot(ctx: Ctx2D, d: Droplet): void {
  if (d.radius <= 0 || d.alpha <= 0) return;
  ctx.globalAlpha = d.alpha;
  (ctx as unknown as { fillStyle: string }).fillStyle = d.color;
  ctx.beginPath();
  ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
  ctx.fill();
}

/** Ellipse (oriented). */
export function paintEllipseDot(ctx: Ctx2D, d: Droplet): void {
  const a = Math.max(0.1, d.radius);
  const b = Math.max(0.1, a * Math.max(0.05, Math.min(1, d.aspect ?? 0.6)));
  const rot = ((d.angleDeg ?? 0) * Math.PI) / 180;
  ctx.save();
  ctx.translate(d.x, d.y);
  ctx.rotate(rot);
  ctx.globalAlpha = d.alpha;
  (ctx as unknown as { fillStyle: string }).fillStyle = d.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, a, b, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Dispatch by shape. */
export function paintDroplet(ctx: Ctx2D, d: Droplet): void {
  if (d.shape === "ellipse") paintEllipseDot(ctx, d);
  else paintCircleDot(ctx, d);
}
