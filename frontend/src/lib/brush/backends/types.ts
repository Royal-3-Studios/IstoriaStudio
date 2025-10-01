// FILE: src/lib/brush/backends/types.ts
import type { BrushInputConfig } from "@/data/brushPresets";

/** Surface a backend draws into (engine handles DPR; draw in CSS space). */
export type CanvasSurface = HTMLCanvasElement | OffscreenCanvas;

/** Points given to adapters (accept both `p` and `pressure`). */
export type RenderStrokePoint = {
  x: number;
  y: number;
  p?: number; // preferred shorthand 0..1
  pressure?: number; // compatibility 0..1
  angle?: number;
  tilt?: number;
  t?: number; // timestamp (optional)
};

/** Options passed to adapters from harness/engine. */
export type RenderStrokeOptions = {
  /** Target viewport size in CSS pixels. */
  width: number;
  height: number;

  /** Stable seed for deterministic randomness (optional). */
  seed?: number;

  /** Stroke path in CSS space (adapters should normalize before passing to engine). */
  path?: RenderStrokePoint[];

  /**
   * Adapter-specific extras. Each adapter should narrow/cast this to its
   * own typed surface (e.g., Partial<RenderOverrides> plus local keys).
   */
  extra?: Record<string, unknown>;

  /** Optional pass-throughs to engine RenderOptions (adapters forward when present). */
  color?: string; // e.g. "#353535"
  pixelRatio?: number; // preferred DPR key
  dpr?: number; // legacy alias; adapters should map to pixelRatio
  input?: BrushInputConfig; // pressure curve & input-quality

  /** Optional convenience: some adapters want to accept this directly. */
  baseSizePx?: number; // if absent, adapter may derive or use default
};

/** Minimal contract every backend adapter implements. */
export type BackendAdapter = {
  id: string;
  name: string;
  renderStroke(
    surface: CanvasSurface,
    opts: RenderStrokeOptions
  ): Promise<void> | void;
};
