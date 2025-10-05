// FILE: src/lib/brush/backends/impasto/core/bristle-model.ts
import type { RNG } from "@backends/utils/random";

export type BristleParams = {
  baseSizePx: number;
  radiusMin?: number; // absolute px clamp
  radiusMax?: number; // absolute px clamp
  radiusK?: number; // pressure curve gain
  alphaBias?: number; // flat alpha bias
  alphaGain?: number; // scales pressure alpha
  jitterPx?: number; // small transverse jitter
};

export function pressureToRadius(p: number, cfg: BristleParams): number {
  const q = Math.pow(Math.max(0, Math.min(1, p)), cfg.radiusK ?? 0.85);
  const r = cfg.baseSizePx * 0.5 * (0.6 + 0.9 * q);
  const lo = Math.max(0.25, cfg.radiusMin ?? 0.5);
  const hi = Math.max(lo, cfg.radiusMax ?? r * 4);
  return Math.min(hi, Math.max(lo, r));
}

export function pressureToAlpha(p: number, cfg: BristleParams): number {
  const q = Math.pow(Math.max(0, Math.min(1, p)), 1.05);
  const base = 0.35 + q * (cfg.alphaGain ?? 0.45);
  return Math.max(0, Math.min(1, base + (cfg.alphaBias ?? 0)));
}

/** tiny symmetric jitter in px along normal; returns offset amount (−j..+j) */
export function jitterAmount(jitterPx = 0, rng?: RNG): number {
  if (jitterPx <= 0) return 0;
  const u = rng ? rng.nextFloat() : Math.random();
  return (u * 2 - 1) * jitterPx;
}
