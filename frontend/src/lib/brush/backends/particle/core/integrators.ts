import type { Particle } from "./emitters";

export type IntegratorOpts = {
  dt: number; // seconds
  drag?: number; // 0..1 per second (approx), higher = more damping
};

export function eulerStep(p: Particle, { dt, drag = 0 }: IntegratorOpts): void {
  // simple drag proportional to velocity
  const k = Math.max(0, Math.min(1, drag));
  const damp = 1 / (1 + k * dt);
  p.vx *= damp;
  p.vy *= damp;

  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.age += dt;
}
