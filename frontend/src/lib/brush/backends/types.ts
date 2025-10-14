// FILE: src/lib/brush/backends/types.ts
// Canonical, shared primitives for all backends/adapters.
// exactOptionalPropertyTypes-safe: optional props are absent, not `undefined`.

import type { BrushInputConfig } from "@/data/brushPresets";
import type { BackendCaps } from "@/lib/brush/backends/caps";

/** DOM or Offscreen canvas. Draw in CSS space; engine normalizes DPR. */
export type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

/** 2D context across DOM and Offscreen implementations. */
export type Ctx2D =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

/** Minimal render target abstraction (alias of CanvasLike; kept for clarity). */
export type CanvasSurface = CanvasLike;

/** Stroke point supplied to adapters (CSS-space coordinates). */
export type RenderStrokePoint = {
  x: number; // CSS px
  y: number; // CSS px
  p?: number; // preferred shorthand for pressure, normalized [0..1]
  pressure?: number; // compatibility alias, normalized [0..1]
  angle?: number; // stroke tangent angle (radians)
  tilt?: number; // stylus tilt altitude in radians (optional)
  t?: number; // timestamp (ms)
};

/** Narrow type for adapter extras passed through from the engine. */
export type AdapterExtra = {
  /** Global/local overrides — e.g., flow (0..100). Extend as needed. */
  overrides?: { flow?: number } & Record<string, unknown>;
  /** Stroke path controls — e.g., distance-based spacing in CSS px. */
  strokePath?: { spacing?: number } & Record<string, unknown>;
  /** Brush shape/tip information (backend-defined fields allowed). */
  shape?: Record<string, unknown>;
  /** Rendering intent/mode flags. */
  rendering?: Record<string, unknown>;
  /** Paper/tip grain controls. */
  grain?: Record<string, unknown>;
};

/** Options passed to adapters from the engine/harness. */
export type RenderStrokeOptions = {
  /** Target viewport size in CSS pixels. */
  width: number;
  height: number;

  /** Device pixel ratio for rasterization. */
  pixelRatio: number;

  /** Stable seed for deterministic randomness. */
  seed?: number;

  /** Stroke path in CSS space. */
  path: ReadonlyArray<RenderStrokePoint>;

  /**
   * Adapter-specific extra knobs (typed as a shared bag; adapters can narrow).
   * Keep generic here; adapters define their own specific shape locally.
   */
  extra?: AdapterExtra;

  /** Pass-throughs to engine RenderOptions. */
  color?: string; // e.g. "#353535"

  /** Input pipeline (pressure curve, smoothing, quality). */
  input?: BrushInputConfig;

  /** Optional convenience: base brush size in pixels. */
  baseSizePx?: number;
};

/** Minimal contract every backend adapter implements. */
export type BackendAdapter = {
  /** Stable id (used in registry/selection). */
  id: string;
  /** Human-readable name. */
  name: string;

  /** Capability flags (optional; lets UI enable/disable knobs). */
  caps?: BackendCaps;

  renderStroke(
    surface: CanvasSurface,
    opts: RenderStrokeOptions
  ): Promise<void> | void;
};
