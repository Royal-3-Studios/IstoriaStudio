// FILE: src/lib/brush/backends/impasto/utils/rng.ts
export type RNG = { nextFloat(): number };

export function makeMulberry32(seed: number): RNG {
  let t = seed >>> 0;
  return {
    nextFloat(): number {
      t += 0x6d2b79f5;
      let x = Math.imul(t ^ (t >>> 15), 1 | t);
      x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Adapt a mulberry-like RNG (must have nextFloat) into our RNG type. */
export function rngFromMulberry(m: { nextFloat: () => number }): RNG {
  return { nextFloat: () => m.nextFloat() };
}
