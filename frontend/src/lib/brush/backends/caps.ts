// FILE: src/lib/brush/backends/caps.ts
/**
 * Capability flags advertised by each backend adapter.
 * Keep this tiny and additive; avoid breaking changes.
 *
 * Required truths across all shipped backends:
 *  - pressure: true  (all backends consume pressure)
 *  - spacing:  true  (all use distance-based spacing)
 *
 * Optional caps let the UI enable/disable knobs intelligently.
 */

export type BackendCaps = Readonly<{
  /** Backend consumes stylus pressure (always true for our stack). */
  pressure: true;

  /** Backend uses distance-based spacing between stamps/samples. */
  spacing: true;

  /** Honours a global/local "flow" control (alpha/ink amount). */
  flow?: boolean;

  /** Uses stylus tilt (altitude/azimuth) if available. */
  tilt?: boolean;

  /** Uses input stroke direction / azimuth explicitly (for dynamics). */
  angle?: boolean;

  /** Supports brush tip rotation (e.g., chisel nib rotation). */
  rotation?: boolean;

  /** Supports paper-locked / tip-locked / smudge-locked grain motion. */
  grainMotion?: boolean;

  /** Wet simulation (wash, bloom, edge diffusion, lift…). */
  wet?: boolean;

  /** Smudge pickup/mix/drag pipeline. */
  smudge?: boolean;

  /**
   * Heightfield/impasto with lighting/shadows.
   * NOTE: `lighting` kept for back-compat; prefer `heightfield`.
   */
  heightfield?: boolean;
  lighting?: boolean;

  /** Can run efficiently on GPU (WebGL/WebGPU) — advisory only. */
  gpu?: boolean;

  /** Has a worker-safe path (OffscreenCanvas/transferables). */
  worker?: boolean;
}>;

/** Minimal baseline every backend should satisfy. */
export const BASE_CAPS: BackendCaps = Object.freeze({
  pressure: true,
  spacing: true,
});

/**
 * Merge helper to build a caps object with BASE_CAPS guarantees.
 * Usage:
 *   export const caps = withBaseCaps({ flow: true, tilt: true });
 */
export function withBaseCaps<
  T extends Omit<BackendCaps, "pressure" | "spacing">,
>(caps: T): BackendCaps & T {
  return Object.freeze(Object.assign({}, BASE_CAPS, caps));
}

/**
 * Tiny type guard: check if a backend advertises a given optional capability.
 * Example: if (hasCap(adapter.caps, "tilt")) { ... }
 */
export function hasCap<
  K extends keyof Omit<BackendCaps, "pressure" | "spacing">,
>(
  caps: BackendCaps | undefined,
  key: K
): caps is BackendCaps & Required<Pick<BackendCaps, K>> {
  return !!caps && (caps as Record<string, unknown>)[key] === true;
}

/* --------------------- handy presets to keep adapters terse --------------------- */

export const CAPS_STAMPING_TILT = withBaseCaps({
  flow: true,
  tilt: true,
  angle: true,
  rotation: true,
  grainMotion: true,
});

export const CAPS_RIBBON_TILT = withBaseCaps({
  flow: true,
  tilt: true,
  angle: true,
  rotation: true,
});

export const CAPS_SPRAY_TILT = withBaseCaps({
  flow: true,
  tilt: true, // e.g., tilt → elliptical footprint
});

export const CAPS_SMUDGE = withBaseCaps({
  smudge: true,
});

export const CAPS_WET = withBaseCaps({
  wet: true,
  flow: true,
  tilt: true, // set to false if you don’t route tilt in wet variants
});

export const CAPS_IMPASTO = withBaseCaps({
  heightfield: true,
  lighting: true, // legacy alias, if you reference it elsewhere
  tilt: true,
});

export const CAPS_PATTERN = withBaseCaps({
  flow: true,
  grainMotion: true,
});

export const CAPS_PARTICLE = withBaseCaps({
  flow: true,
  tilt: true, // set false if emission doesn’t use tilt
});
