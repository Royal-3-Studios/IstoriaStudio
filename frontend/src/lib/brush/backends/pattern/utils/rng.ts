// FILE: src/lib/brush/backends/pattern/utils/rng.ts

export interface RNG {
  nextFloat(): number; // [0,1)
}

export function mulberry32(seed: number): RNG {
  let t = seed >>> 0;
  return {
    nextFloat() {
      t |= 0;
      t = (t + 0x6d2b79f5) | 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    },
  };
}
