// FILE: src/lib/brush/backends/ribbon/types.ts

import type {
  RenderOptions,
  RenderOverrides,
  EngineStrokePath,
  RenderPathPoint,
} from "@/lib/brush/engine.types";
import type { CanvasLike } from "@backends/utils/canvas";

/* -------------------------- Tip & stroke options -------------------------- */

export type RibbonTip =
  | { kind: "round" }
  | {
      kind: "sprite";
      image: CanvasImageSource;
      /** Multiplier applied to computed width (default 1). */
      sizeScale?: number;
      /** Advisory softness hint—some renderers may ignore it. */
      softness?: number;
    };

export type RibbonOptions = {
  /** Pixel spacing between stamps (≈2 is a silky default). */
  spacing: number;
  /** 0..1, scales perpendicular jitter as a fraction of spacing. */
  jitter?: number;
  /** 0..100 streamline amount (EMA). */
  streamline?: number;
  /** Absolute minimum step in CSS px to prevent overdraw at tiny widths. */
  minSpacingPx?: number;
  /** Multi-track stamping (usually 1 for ribbon). */
  count?: number;
  /** Stroke cap for path-based passes. */
  cap?: CanvasLineCap;
  /** Stamp tip; round by default. */
  tip?: RibbonTip;
};

/* ---------------------------- Public draw signature ---------------------------- */
/**
 * Accepts either:
 *  - EngineStrokePath (your existing engine path container), or
 *  - Any Iterable/array of RenderPathPoint (plain points you already have).
 */
export type DrawRibbonToCanvas = (
  surface: CanvasLike,
  path: EngineStrokePath | Iterable<RenderPathPoint>,
  options: RenderOptions & { strokePath: RibbonOptions },
  overrides?: RenderOverrides
) => void;
