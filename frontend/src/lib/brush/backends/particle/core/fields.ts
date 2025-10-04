import type { Particle } from "./emitters";

export type FieldOpts = {
  gravity?: { x: number; y: number }; // px/s^2
  wind?: { x: number; y: number }; // px/s^2
  /** optional constant fade per second */
  fadePerSec?: number;
};

export function applyFields(p: Particle, dt: number, f: FieldOpts): void {
  if (f.gravity) {
    p.vx += f.gravity.x * dt;
    p.vy += f.gravity.y * dt;
  }
  if (f.wind) {
    p.vx += f.wind.x * dt;
    p.vy += f.wind.y * dt;
  }
  if (f.fadePerSec && f.fadePerSec > 0) {
    p.alpha = Math.max(0, p.alpha - f.fadePerSec * dt);
  }
}
