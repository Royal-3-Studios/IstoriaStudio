/** Radial falloff kernels return weight in [0..1] for r in [0..1]. */
export function falloffGaussian(r01: number): number {
  const r = Math.max(0, Math.min(1, r01));
  // gentle gaussian-ish
  return Math.exp(-3.0 * r * r);
}

export function falloffCosine(r01: number): number {
  const r = Math.max(0, Math.min(1, r01));
  // raised cosine
  return (1 + Math.cos(Math.PI * Math.min(1, r))) * 0.5;
}
