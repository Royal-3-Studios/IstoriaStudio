// FILE: src/lib/brush/backends/spray/types.ts
import type {
  RenderOptions,
  RenderOverrides,
  EngineStrokePath,
} from "@/lib/brush/engine";
import type { CanvasLike } from "@/lib/brush/backends/utils/canvas";

/**
 * Spray (airbrush) options. All numbers are pixels / seconds / percents as noted.
 * exactOptionalPropertyTypes-safe: optional fields are explicitly optional.
 */
export type SprayOptions = {
  /** Gaussian sigma in px at base size (controls softness). */
  sigmaPx: number;
  /** Hardness 0..100; 0 = soft, 100 = sharper edge (reduces sigma scale). */
  hardness?: number;
  /** Global flow 0..100; default 100. */
  flow?: number;

  /**
   * Dual-rate deposition:
   * - When pointer is effectively stationary, use hoverRateAlphaPerSec (alpha per second).
   * - When moving, alpha added ≈ moveRateAlphaPerPx * distancePx.
   */
  hoverRateAlphaPerSec?: number; // default 1.0
  moveRateAlphaPerPx?: number; // default 0.04

  /**
   * Minimal “emission step” in ms; smaller = smoother but more draw calls.
   * We’ll integrate deposition continuously; this only bounds sampling.
   */
  minStepMs?: number; // default 8 ms

  /**
   * Optional multiplicative noise:
   *   amount 0..1 (0=off), scale in px.
   * Noise modulates alpha per stamp to avoid banding.
   */
  noiseAmount?: number; // default 0
  noiseScalePx?: number; // default 64

  /**
   * Stamp resolution in pixels for the prerendered Gaussian sprite.
   * Higher = smoother edge at large sizes, costs memory/drawImage scaling.
   */
  spriteResolution?: number; // default 256
};

export type DrawSprayToCanvas = (
  surface: CanvasLike,
  path: EngineStrokePath,
  options: RenderOptions & { spray: SprayOptions },
  overrides?: RenderOverrides
) => void;
1;
