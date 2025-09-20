// Lightweight, seedable RNG utilities for deterministic brush jitter.

/** Simple 32-bit hash (xmur3). Great for turning strings -> seeds. */
function xmur3(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Derive a 32-bit seed from arbitrary inputs (numbers/strings). */
export function seedFrom(...parts: Array<string | number>): number {
  let h = 0x9e3779b9; // golden ratio
  for (const p of parts) {
    const v = typeof p === "number" ? p >>> 0 : xmur3(String(p));
    h ^= v + 0x9e3779b9 + ((h << 6) | 0) + (h >>> 2);
    h >>>= 0;
  }
  return h >>> 0;
}

export interface RNG {
  /** [0,1) */
  nextFloat(): number;
  /** [0, max) */
  nextIntExclusive(max: number): number;
  /** [min, max] inclusive */
  nextIntInclusive(min: number, max: number): number;
  /** Uniform float in [min, max) */
  range(min: number, max: number): number;
  /** true with probability p (default 0.5) */
  bool(p?: number): boolean;
  /** Standard normal via Box–Muller; mean/sigma optional */
  normal(mean?: number, sigma?: number): number;
  /** Advance by n draws (skips output) */
  skip(n: number): void;
  /** Save/restore/get state */
  state(): number;
  save(): number;
  restore(state: number): void;
  /** Reseed & fork child generators */
  seed(v: number): void;
  fork(label?: string | number): RNG;
}

/** Fast 32-bit generator (Mulberry32). Good speed/quality for UI effects. */
export function mulberry32(seed = 123456789): RNG {
  let s = seed >>> 0;
  // cache for Box–Muller second variate
  let haveSpare = false;
  let spare = 0;

  function nextFloat(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const api: RNG = {
    nextFloat,

    nextIntExclusive(max: number): number {
      // Bias is tiny for moderately sized max; good enough for brush jitter.
      return (nextFloat() * Math.max(0, max | 0)) | 0;
    },

    nextIntInclusive(min: number, max: number): number {
      const lo = Math.min(min | 0, max | 0);
      const hi = Math.max(min | 0, max | 0);
      return lo + ((nextFloat() * (hi - lo + 1)) | 0);
    },

    range(min: number, max: number): number {
      return min + (max - min) * nextFloat();
    },

    bool(p = 0.5): boolean {
      return nextFloat() < (p <= 0 ? 0 : p >= 1 ? 1 : p);
    },

    normal(mean = 0, sigma = 1): number {
      // Box–Muller with caching; sufficient for jitter.
      if (haveSpare) {
        haveSpare = false;
        return mean + spare * sigma;
      }
      let u = 0,
        v = 0;
      // avoid 0 to prevent log(0)
      do {
        u = nextFloat();
      } while (u <= 1e-12);
      v = nextFloat();
      const mag = Math.sqrt(-2.0 * Math.log(u));
      const z0 = mag * Math.cos(2 * Math.PI * v);
      const z1 = mag * Math.sin(2 * Math.PI * v);
      spare = z1;
      haveSpare = true;
      return mean + z0 * sigma;
    },

    skip(n: number): void {
      for (let i = 0; i < n; i++) void nextFloat();
      // clear Box–Muller cache because stream alignment changed
      haveSpare = false;
      spare = 0;
    },

    state(): number {
      return s >>> 0;
    },
    save(): number {
      return s >>> 0;
    },

    restore(state: number): void {
      s = state >>> 0;
      haveSpare = false;
      spare = 0;
    },

    seed(v: number): void {
      s = v >>> 0 || 1;
      haveSpare = false;
      spare = 0;
    },

    fork(label: string | number = 0): RNG {
      // Derive a distinct child seed from current state + label.
      const childSeed = seedFrom(s, label);
      return mulberry32(childSeed);
    },
  };

  return api;
}

/** Convenience: create a RNG from mixed seeds (string, numbers). */
export function createRNG(...parts: Array<string | number>): RNG {
  return mulberry32(seedFrom(...parts));
}
