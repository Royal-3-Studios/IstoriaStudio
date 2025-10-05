// FILE: src/lib/brush/backends/types.ts
// Canonical, shared primitives for all backends/adapters.
// exactOptionalPropertyTypes-safe: optional props are absent, not `undefined`.

import type { BrushInputConfig } from "@/data/brushPresets";

/** DOM or Offscreen canvas. Draw in CSS space; engine normalizes DPR. */
export type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

/** 2D context across DOM and Offscreen implementations. */
export type Ctx2D =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

/** Minimal render target abstraction (alias of CanvasLike; kept for clarity). */
export type CanvasSurface = CanvasLike;

/** Points supplied to adapters. Accept both `p` and `pressure` for convenience. */
export type RenderStrokePoint = {
  x: number; // CSS px
  y: number; // CSS px
  p?: number; // preferred shorthand 0..1
  pressure?: number; // compatibility 0..1
  angle?: number; // degrees [0..360)
  tilt?: number; // 0..1 altitude
  t?: number; // timestamp (ms)
};

/** Options passed to adapters from the engine/harness. */
export type RenderStrokeOptions = {
  /** Target viewport size in CSS pixels. */
  width: number;
  height: number;

  /** Stable seed for deterministic randomness. */
  seed?: number;

  /** Stroke path in CSS space. */
  path?: ReadonlyArray<RenderStrokePoint>;

  /**
   * Adapter-specific extra knobs (narrow in adapter code).
   * Keep generic here; adapters define their own specific shape locally.
   */
  extra?: Record<string, unknown>;

  /** Pass-throughs to engine RenderOptions. */
  color?: string; // e.g. "#353535"
  pixelRatio?: number; // preferred DPR key

  /**
   * @deprecated Use `pixelRatio`. Kept for compatibility while refactoring.
   * Do not write `undefined` — simply omit this key.
   */
  dpr?: number;

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

  renderStroke(
    surface: CanvasSurface,
    opts: RenderStrokeOptions
  ): Promise<void> | void;
};
