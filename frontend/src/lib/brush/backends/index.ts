// FILE: src/lib/brush/backends/index.ts

// Namespace-style (grouped modules)
export * as Mathx from "./utils/math";
export * as Vec from "./utils/vector";
export {
  Rand,
  mulberry32,
  rngFrom,
  type RNG,
  type RNGLike,
} from "./utils/random";
export * as Curves from "./utils/curves";
export * as LUT from "./utils/luts";
export * as Noise from "./utils/noise";
export * as Color from "./utils/color";
export * as Blend from "./utils/blending";
export * as Sampler from "./utils/sampler";
export * as Texture from "./utils/texture";
export * as Stroke from "./utils/stroke";
export * as Pressure from "@core/pressure";
export * as Dynamics from "@core/dynamics";
export * as CanvasUtil from "@backends/utils/canvas";
export * as Perf from "./utils/perf";
export * as Timing from "@/lib/shared/timing";

// Named convenience re-exports (hot path)
export {
  withCompositeAndAlpha,
  withComposite,
  withAlpha,
  toCompositeOp,
  isCompositeSupported,
  type Ctx2D as BlendCtx2D,
} from "./utils/blending";

export {
  createLayer,
  ensureCanvas2D,
  clearCanvas,
  get2D,
  get2DOrNull,
  type Ctx2D,
} from "@backends/utils/canvas";

export {
  resamplePath,
  resolveSpacingFraction,
  segmentNormal,
} from "./utils/stroke";

export {
  makeMultiplyTile,
  makeAlphaNoiseTile,
  makeHoleDotTile,
  fillPatternWithRandomPhase,
} from "./utils/texture";

// ---------------------------------------------------------------------------
// Adapters registry (single source of truth for rendering backends)
// ---------------------------------------------------------------------------

import type { BackendAdapter } from "@backends/types";
import type { BrushBackend } from "@/lib/brush/core/types";

// Import each adapter’s default export
import stamping from "./stampingAdapter";
import ribbon from "./ribbonAdapter";
import spray from "./sprayAdapter";
import smudge from "./smudgeAdapter";
import pattern from "./patternAdapter";
import particle from "./particleAdapter";
import wet from "./wetAdapter";
import impasto from "./impastoAdapter";

// Valid registry keys are real backends (no "auto")
type BackendId = Exclude<BrushBackend, "auto">;

export const BACKENDS: Record<BackendId, BackendAdapter> = {
  stamping,
  ribbon,
  spray,
  smudge,
  pattern,
  particle,
  wet,
  impasto,
} as const;

export function getBackend(id: BackendId): BackendAdapter {
  return BACKENDS[id];
}

// Optional: re-export the adapter type so callers can stay on '@backends'
export type { BackendAdapter } from "@backends/types";
