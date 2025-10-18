import type {
  RenderOptions,
  RenderOverrides,
  EngineStrokePath,
  RenderPathPoint,
} from "@/lib/brush/engine.types";
import type { CanvasLike } from "@backends/utils/canvas";

/** Public options resolved for the wet renderer. */
export type WetOptions = {
  // stroke placement
  spacingPercent: number; // % of diameter per step
  jitterPercent: number; // 0..100 (% of spacing)
  scatterPx: number; // orthogonal jitter (px)
  streamline: number; // 0..100

  // “water” model (mapped from Engine wet overrides)
  diffusion: number; // 0..2
  pooling: number; // 0..2
  pickup: number; // 0..2
  wetEdges: boolean; // edge darkening toggle
  edgeGain: number; // 0..2
  edgeRadiusPx: number; // px
  granulation: number; // 0..1

  // runtime
  iterations: number; // diffusion steps
  stepPx: number; // solver grid resolution

  // flow/opacity
  flow01: number; // 0..1 (global)
  opacity01: number; // 0..1 (composite alpha)
};

export type DrawWetToCanvas = (
  surface: CanvasLike,
  path: EngineStrokePath | Iterable<RenderPathPoint>,
  options: RenderOptions & { wet: WetOptions },
  overrides?: RenderOverrides
) => void;
