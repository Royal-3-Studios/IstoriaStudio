// FILE: src/lib/brush/backends/stamping/core/distribution.ts

/** Deterministic-friendly RNG interface (use Math.random by default). */
export type RNG = { next: () => number } | (() => number);

/** Normalize RNG to a function. */
function toRand(rng?: RNG): () => number {
  if (!rng) return Math.random;
  return typeof rng === "function" ? rng : rng.next.bind(rng);
}

/** Options for naive Poisson-like sampling in a rectangular region. */
export type PoissonOpts = {
  /** Minimum allowed distance between samples (px). */
  minDistPx: number;
  /** How many random attempts per accepted point before giving up (default 20). */
  tries?: number;
  /** Max number of points to try to generate (optional). */
  maxPoints?: number;
  /** Optional RNG (seedable). */
  rng?: RNG;
};

/** Simple thinning test: accept (x,y) if at least minDistPx from all previous points. */
export function acceptWithMinDistance(
  xs: number[],
  ys: number[],
  x: number,
  y: number,
  minDistPx: number
): boolean {
  const r2 = minDistPx * minDistPx;
  for (let i = 0; i < xs.length; i++) {
    const dx = x - xs[i]!;
    const dy = y - ys[i]!;
    if (dx * dx + dy * dy < r2) return false;
  }
  return true;
}

/** Uniform random point in a disk of radius R (returns dx,dy). */
export function randomInDisk(
  radius: number,
  rng?: RNG
): { dx: number; dy: number } {
  const rand = toRand(rng);
  const u = rand();
  const v = rand();
  // polar: r = R * sqrt(u), theta = 2πv
  const r = radius * Math.sqrt(u);
  const a = 2 * Math.PI * v;
  return { dx: r * Math.cos(a), dy: r * Math.sin(a) };
}

/**
 * Very simple Poisson-like sampler in [0..w]×[0..h].
 * Not Bridson’s grid algorithm—just repeated rejection using acceptWithMinDistance.
 * Good enough for ornaments/splatter; fast and minimal.
 */
export function poissonDisc2D(
  w: number,
  h: number,
  opts: PoissonOpts
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  const xs: number[] = [];
  const ys: number[] = [];

  const rand = toRand(opts.rng);
  const tries = Math.max(1, Math.floor(opts.tries ?? 20));
  const limit = Math.max(1, Math.floor(opts.maxPoints ?? 9999));
  const r = Math.max(0.5, opts.minDistPx);

  // keep attempting random points until we fail a bunch in a row OR hit limit
  let failStreak = 0;
  while (out.length < limit && failStreak < tries) {
    const x = rand() * w;
    const y = rand() * h;
    if (acceptWithMinDistance(xs, ys, x, y, r)) {
      out.push({ x, y });
      xs.push(x);
      ys.push(y);
      failStreak = 0;
    } else {
      failStreak++;
    }
  }
  return out;
}

/**
 * Filter an existing list of candidates to enforce min distance. Order matters:
 * earlier points are favored; later points get dropped if too close.
 */
export function thinByMinDistance(
  pts: ReadonlyArray<{ x: number; y: number }>,
  minDistPx: number
): Array<{ x: number; y: number }> {
  const keep: Array<{ x: number; y: number }> = [];
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of pts) {
    if (acceptWithMinDistance(xs, ys, p.x, p.y, minDistPx)) {
      keep.push(p);
      xs.push(p.x);
      ys.push(p.y);
    }
  }
  return keep;
}

/**
 * Scatter stamps around a polyline path:
 * - `path` is a list of {x,y}
 * - `stepPx` is the nominal along-path step
 * - `normalJitterPx` is perpendicular jitter magnitude (disk radius)
 * - `minDistPx` thins points in screen space
 */
export function scatterAroundPath(
  path: ReadonlyArray<{ x: number; y: number }>,
  stepPx: number,
  normalJitterPx: number,
  minDistPx: number,
  rng?: RNG
): Array<{ x: number; y: number }> {
  const rand = toRand(rng);
  if (!path || path.length < 2 || !(stepPx > 0)) return [];

  const out: Array<{ x: number; y: number }> = [];
  let carry = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-6) continue;

    const ux = dx / segLen;
    const uy = dy / segLen;
    const nx = -uy; // left normal
    const ny = ux;

    let s = carry;
    while (s <= segLen) {
      // base point on the segment
      const x = a.x + ux * s;
      const y = a.y + uy * s;

      // jitter in disk around the normal direction
      const { dx: jx, dy: jy } = randomInDisk(normalJitterPx, rand);
      const px = x + nx * jx + ny * jy;

      const py = y; // jy was already applied in normal frame; convert back:
      // Wait: we actually applied both jx and jy in the normal/tangent space; correct transform:
      // We used (nx,ny) for x-axis; the tangent (ux,uy) for y-axis:
      const qx = x + nx * jx + ux * jy;
      const qy = y + ny * jx + uy * jy;

      out.push({ x: qx, y: qy });
      s += stepPx;
    }
    carry = s - segLen;
  }

  // thin in screen space to ensure no crowding
  return thinByMinDistance(out, Math.max(0, minDistPx));
}
