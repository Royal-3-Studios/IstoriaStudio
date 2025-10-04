// FILE: src/lib/brush/backends/stamping/core/distribution.ts
export type PoissonOpts = { minDistPx: number; tries?: number };
/** Simple thinning for scattered ornaments; placeholder you can expand later. */
export function acceptWithMinDistance(
  xs: number[],
  ys: number[],
  x: number,
  y: number,
  minDistPx: number
): boolean {
  for (let i = 0; i < xs.length; i++) {
    const dx = x - xs[i]!;
    const dy = y - ys[i]!;
    if (dx * dx + dy * dy < minDistPx * minDistPx) return false;
  }
  return true;
}
