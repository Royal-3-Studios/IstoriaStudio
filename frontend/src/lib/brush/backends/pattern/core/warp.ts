// FILE: src/lib/brush/backends/pattern/core/warp.ts

/** Optional tiny UV warp for organic look. */
export function warpUV(
  u: number,
  v: number,
  strength = 0.0
): { u: number; v: number } {
  if (strength <= 0) return { u, v };
  const su =
    Math.sin((u + v * 0.7) * 2.1) * 0.5 + Math.sin(u * 1.7 - v * 0.6) * 0.5;
  const sv =
    Math.cos((v + u * 0.5) * 2.0) * 0.5 + Math.cos(v * 1.9 + u * 0.4) * 0.5;
  return { u: u + su * strength, v: v + sv * strength };
}
