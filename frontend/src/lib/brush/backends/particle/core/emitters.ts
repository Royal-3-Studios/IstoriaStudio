import type { RenderPathPoint } from "@/lib/brush/engine.types";
import { clamp } from "@backends/utils/math";

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // total lifetime (s)
  age: number; // current age (s)
  size: number; // px
  alpha: number; // 0..1
};

export type SpawnOpts = {
  /** particles per path point (can be fractional; we probabilistically round) */
  rate: number;
  /** initial speed in px/s */
  speedPxPerSec: number;
  /** lifetime in seconds */
  lifetimeSec: { min: number; max: number };
  /** size in px */
  sizePx: { min: number; max: number };
  /** tangent jitter in radians */
  dirJitterRad?: number;
  /** normal scatter in px */
  scatterPx?: number;
  /** RNG in [0,1) */
  rand: () => number;
};

/** deterministic-ish helper */
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function emitAlongPath(
  path: ReadonlyArray<RenderPathPoint>,
  opts: SpawnOpts
): Particle[] {
  const out: Particle[] = [];
  if (!path.length) return out;

  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;
    // probabilistic rounding for fractional rate
    const whole = Math.floor(opts.rate);
    const frac = opts.rate - whole;
    let count = whole + (opts.rand() < frac ? 1 : 0);
    if (count <= 0) continue;

    // tangent estimate (forward diff; fallback to previous)
    const a = i > 0 ? path[i - 1]! : p;
    const b = i < path.length - 1 ? path[i + 1]! : p;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L;
    const uy = dy / L;

    while (count-- > 0) {
      const jitterAng = (opts.dirJitterRad ?? 0) * (opts.rand() * 2 - 1);
      const c = Math.cos(jitterAng),
        s = Math.sin(jitterAng);
      // rotate (ux,uy) by jitter
      const jx = ux * c - uy * s;
      const jy = ux * s + uy * c;

      const scatter = (opts.scatterPx ?? 0) * (opts.rand() * 2 - 1);
      const nx = -uy,
        ny = ux; // unit normal

      const speed = opts.speedPxPerSec;
      const size = lerp(opts.sizePx.min, opts.sizePx.max, opts.rand());
      const life = lerp(
        opts.lifetimeSec.min,
        opts.lifetimeSec.max,
        opts.rand()
      );

      out.push({
        x: p.x + nx * scatter,
        y: p.y + ny * scatter,
        vx: jx * speed,
        vy: jy * speed,
        life: Math.max(0.05, life),
        age: 0,
        size: Math.max(0.5, size),
        alpha: 1,
      });
    }
  }
  return out;
}

/** normalize alpha by age/life with optional curve */
export function ageToAlpha(
  age: number,
  life: number,
  curve: "linear" | "ease" = "ease"
): number {
  const t = clamp(age / Math.max(1e-6, life), 0, 1);
  if (curve === "linear") return 1 - t;
  // ease (cosine)
  return (1 + Math.cos(Math.PI * t)) * 0.5;
}
