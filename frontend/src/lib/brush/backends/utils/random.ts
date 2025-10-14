// FILE: src/lib/brush/backends/utils/random.ts
// Canonical RNG for all backends — deterministic, strict-safe.
// Keeps your original API (RNG, mulberry32, seedFrom, createRNG) and adds:
// - RNGLike support (RNG | {nextFloat():number} | () => number)
// - rngFrom() to normalize legacy/random functions into a full RNG.

import { atOrThrow } from "@/lib/brush/core/guards";

//////////////////// Hashing / seeding ////////////////////

/** Simple 32-bit hash (xmur3). String -> uint32 seed. */
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
export function seedFrom(...parts: ReadonlyArray<string | number>): number {
  let h = 0x9e3779b9 >>> 0; // golden ratio
  for (const p of parts) {
    const v = typeof p === "number" ? p >>> 0 : xmur3(String(p));
    h ^= v + 0x9e3779b9 + ((h << 6) | 0) + (h >>> 2);
    h >>>= 0;
  }
  return h >>> 0;
}

//////////////////// Core generator ////////////////////

export interface RNG {
  /** Uniform float in [0,1) */
  nextFloat(): number;
  /** Integer in [0, max) */
  nextIntExclusive(max: number): number;
  /** Integer in [min, max] inclusive */
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

/** Fast 32-bit PRNG (Mulberry32). Deterministic; good for rendering jitter. */
export function mulberry32(seed = 123456789): RNG {
  let s = seed >>> 0;
  let haveSpare = false;
  let spare = 0;

  function nextFloat(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // [0,1)
  }

  const api: RNG = {
    nextFloat,

    nextIntExclusive(max: number): number {
      const m = Math.max(0, max | 0);
      return (nextFloat() * m) | 0; // bias negligible for UI
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
      const pp = p <= 0 ? 0 : p >= 1 ? 1 : p;
      return nextFloat() < pp;
    },

    normal(mean = 0, sigma = 1): number {
      if (haveSpare) {
        haveSpare = false;
        return mean + spare * sigma;
      }
      let u = 0;
      let v = 0;
      // Avoid log(0). nextFloat() never returns 1, but may be ~0.
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
      return mulberry32(seedFrom(s, label));
    },
  };

  return api;
}

/** Convenience: create a RNG from mixed seeds (string, numbers). */
export function createRNG(...parts: ReadonlyArray<string | number>): RNG {
  return mulberry32(seedFrom(...parts));
}

//////////////////// RNGLike support ////////////////////

/** Accepts RNG, {nextFloat()}, or () => number; returns a full RNG facade. */
export type RNGLike = RNG | { nextFloat: () => number } | (() => number);

export function rngFrom(src: RNGLike): RNG {
  // Already a full RNG
  if (
    typeof src === "object" &&
    src !== null &&
    "range" in src &&
    "normal" in src
  ) {
    return src as RNG;
  }
  // Object with nextFloat only
  if (
    typeof src === "object" &&
    src !== null &&
    "nextFloat" in src &&
    typeof (src as { nextFloat: () => number }).nextFloat === "function"
  ) {
    const base = (src as { nextFloat: () => number }).nextFloat;
    return rngFacade(base);
  }
  // Plain function () => number
  if (typeof src === "function") {
    return rngFacade(src);
  }
  // Should not happen, but fallback to deterministic mulberry
  return mulberry32(0xdeadbeef);
}

function rngFacade(next: () => number): RNG {
  // Box–Muller cache for normal()
  let haveSpare = false;
  let spare = 0;

  // Normalize arbitrary generator output to [0,1) robustly
  const u01 = (): number => {
    let v = next();
    if (!Number.isFinite(v)) return 0;
    // Map to fractional part
    v = v - Math.floor(v); // now in [0,1)
    // Guard weird cases: if generator ever returns exactly 1
    if (v >= 1) v = 1 - Number.EPSILON;
    if (v < 0) v = ((v % 1) + 1) % 1; // just in case
    return v === 1 ? 1 - Number.EPSILON : v;
  };

  const rng: RNG = {
    nextFloat(): number {
      return u01();
    },
    nextIntExclusive(max: number): number {
      const m = Math.max(0, max | 0);
      return (u01() * m) | 0;
    },
    nextIntInclusive(min: number, max: number): number {
      const lo = Math.min(min | 0, max | 0);
      const hi = Math.max(min | 0, max | 0);
      return lo + ((u01() * (hi - lo + 1)) | 0);
    },
    range(min: number, max: number): number {
      return min + (max - min) * u01();
    },
    bool(p = 0.5): boolean {
      const pp = p <= 0 ? 0 : p >= 1 ? 1 : p;
      return u01() < pp;
    },
    normal(mean = 0, sigma = 1): number {
      if (haveSpare) {
        haveSpare = false;
        return mean + spare * sigma;
      }
      let u = 0;
      let v = 0;
      do {
        u = u01();
      } while (u <= 1e-12);
      v = u01();
      const mag = Math.sqrt(-2.0 * Math.log(u));
      const z0 = mag * Math.cos(2 * Math.PI * v);
      const z1 = mag * Math.sin(2 * Math.PI * v);
      spare = z1;
      haveSpare = true;
      return mean + z0 * sigma;
    },
    skip(n: number): void {
      for (let i = 0; i < n; i++) void u01();
      haveSpare = false;
      spare = 0;
    },
    state(): number {
      return 0;
    }, // not available for function-backed RNG
    save(): number {
      return 0;
    },
    restore(): void {
      haveSpare = false;
      spare = 0;
    },
    seed(): void {
      haveSpare = false;
      spare = 0;
    },
    fork(): RNG {
      return rng;
    }, // stateless facade; reuse
  };
  return rng;
}

//////////////////// Helpers ////////////////////

export const uniform = (rng: RNGLike): number => rngFrom(rng).nextFloat();

/** Weighted index with >=0 weights (if all zero, returns 0). */
export function weightedIndex(
  rng: RNGLike,
  weights: ReadonlyArray<number>
): number {
  const R = rngFrom(rng);
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i] ?? 0;
    sum += w >= 0 ? w : 0;
  }
  if (!(sum > 0)) return 0;

  let t = R.range(0, sum);
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i] ?? 0;
    const wi = w >= 0 ? w : 0;
    t -= wi;
    if (t <= 0) return i;
  }
  return Math.max(0, weights.length - 1);
}

/** Uniform pick with bounds-safe indexing (uses core/guards). */
export function pick<T>(rng: RNGLike, arr: ReadonlyArray<T>): T {
  if (arr.length === 0) throw new Error("pick() from empty array");
  const R = rngFrom(rng);
  const idx = R.nextIntExclusive(arr.length);
  return atOrThrow(arr, idx); // guarantees T (not T | undefined)
}

//////////////////// Optional OO wrapper (ergonomic) ////////////////////

export class Rand implements RNG {
  private r: RNG;
  constructor(seed: number) {
    this.r = mulberry32(seed);
  }
  nextFloat = () => this.r.nextFloat();
  nextIntExclusive = (m: number) => this.r.nextIntExclusive(m);
  nextIntInclusive = (a: number, b: number) => this.r.nextIntInclusive(a, b);
  range = (a: number, b: number) => this.r.range(a, b);
  bool = (p?: number) => this.r.bool(p);
  normal = (m?: number, s?: number) => this.r.normal(m, s);
  skip = (n: number) => this.r.skip(n);
  state = () => this.r.state();
  save = () => this.r.save();
  restore = (s: number) => this.r.restore(s);
  seed = (v: number) => this.r.seed(v);
  fork = (label?: string | number) => this.r.fork(label);
}

export const rand = (seed: number): RNG => new Rand(seed);
