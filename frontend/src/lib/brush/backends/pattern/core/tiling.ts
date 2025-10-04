// FILE: src/lib/brush/backends/pattern/core/tiling.ts

/** UV wrapping helpers for samplers. */
export type WrapMode = "repeat" | "mirror" | "clamp";

export function wrap(coord: number, size: number, mode: WrapMode): number {
  if (size <= 0) return 0;
  const i = Math.floor(coord);
  const f = coord - i;
  if (mode === "repeat") {
    const x = ((i % size) + size) % size;
    return x + f;
  } else if (mode === "mirror") {
    const period = size * 2;
    const m = ((i % period) + period) % period;
    const mir = m < size ? m : period - 1 - m;
    return mir + f;
  }
  // clamp
  if (coord < 0) return 0;
  if (coord > size - 1) return size - 1;
  return coord;
}
