// src/lib/brush/backends/spray/utils/rng.ts
import { Rand } from "@backends";

/** Minimal RNG surface spray code expects. */
export interface RNG {
  /** 0..1 */
  nextFloat(): number;
  /** signed 32-bit int */
  nextInt32(): number;
}

/** Mulberry32 fallback (if you ever want to decouple from @backends). */
function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return {
    nextFloat(): number {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    nextInt32(): number {
      // derive from nextFloat to keep it simple
      return (this.nextFloat() * 0x100000000) | 0;
    },
  };
}

/**
 * Preferred: use @backends’ Rand.mulberry32 if present (keeps behavior consistent
 * with other backends). Falls back to a local mulberry32 if not available.
 */
export function seededRng(seed: number): RNG {
  const anyRand = Rand as unknown as {
    mulberry32?: (s: number) => {
      nextFloat: () => number;
      nextInt: () => number;
    };
  };
  if (typeof anyRand?.mulberry32 === "function") {
    const r = anyRand.mulberry32(seed >>> 0);
    return {
      nextFloat: () => r.nextFloat(),
      nextInt32: () => r.nextInt(),
    };
  }
  return mulberry32(seed >>> 0);
}
