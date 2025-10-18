// FILE: src/lib/brush/backends/smudge/types.ts
import type {
  RenderOptions,
  RenderOverrides,
  EngineStrokePath,
} from "@/lib/brush/engine";
import type { CanvasLike } from "@/lib/brush/backends/utils/canvas";

/**
 * Smudge/Smear options (all numbers are concrete; exactOptionalPropertyTypes-safe).
 */
export type SmudgeOptions = {
  /** Base tip size control (px, multiplied by pressure→width curve in core). */
  baseSizePx: number;

  /** Transfer strength 0..100 (how strongly the sampled color transfers per step). */
  strengthPct: number;

  /** Scatter in pixels (perpendicular jitter of the *sampling* position). */
  scatterPx: number;

  /** Min ms between smudge steps; balances smoothness and cost. */
  minStepMs: number;

  /**
   * "Dirty tip" behavior:
   *  - amount 0..100: how much of the existing tip pigment is kept when sampling new pixels
   *  - evaporation 0..100: how quickly tip pigment fades each step (higher = cleaner)
   */
  dirtyAmountPct: number;
  dirtyEvapPct: number;

  /** Optional softening blur when drawing the tip (px, 0 disables). */
  softenPx: number;
};

export type DrawSmudgeToCanvas = (
  surface: CanvasLike,
  path: EngineStrokePath,
  options: RenderOptions & { smudge: SmudgeOptions },
  overrides?: RenderOverrides
) => void;
