// FILE: src/lib/brush/backends/particle/types.ts
import type {
  RenderOptions,
  RenderOverrides,
  EngineStrokePath,
  RenderPathPoint,
} from "@/lib/brush/engine";
import type { CanvasLike } from "@/lib/brush/backends/utils/canvas";

/** Decal sprite tip (optional). */
export type ParticleDecal =
  | {
      kind: "sprite";
      image: CanvasImageSource;
      sizeScale?: number; // multiplies computed size (default 1)
    }
  | {
      kind: "round";
    };

export type ParticleInkMode = "rim" | "inner-grain"; // glassy vs toothy feel

/**
 * Particle system options (all concrete numbers; strict-safe).
 */
export type ParticleOptions = {
  /** Particles emitted per second at unit speed; scaled by stroke speed & pressure. */
  emitRatePerSec: number;

  /** Lifetime in ms. */
  lifeMs: number;

  /** Size range in px (final size also scales with pressure). */
  sizeMinPx: number;
  sizeMaxPx: number;

  /** Initial speed range in px/s. */
  speedMin: number;
  speedMax: number;

  /** Linear drag 0..1 per second. */
  dragPerSec: number;

  /** Gravity in px/s^2 (positive pulls down). */
  gravity: number;

  /** Direction spread (radians, half-angle) around stroke tangent. */
  angleSpreadRad: number;

  /** Splatter probability per particle [0..1] (adds extra outward speed + size jitter). */
  splatterProb: number;

  /** Drip: extra gravity while moving down, and soft lengthening factor [0..1]. */
  dripGravity: number; // px/s^2
  dripStretch: number; // 0..1

  /** Optional alpha noise (0..1) and scale in px. */
  noiseAmount: number;
  noiseScalePx: number;

  /** Decal stamping (sprite or round). */
  decal: ParticleDecal;

  /** Quality features */
  antiHaloPx: number; // erase band width outside stamp (px)
  antiHaloAlpha: number; // 0..1 carve strength
  inkMode: ParticleInkMode; // "rim" (glassy) or "inner-grain" (toothy)
};

export type DrawParticleToCanvas = (
  surface: CanvasLike,
  path: Iterable<RenderPathPoint>, // <— WAS EngineStrokePath
  options: RenderOptions & { particle: ParticleOptions },
  overrides?: RenderOverrides
) => void;
