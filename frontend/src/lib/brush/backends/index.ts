// FILE: src/lib/brush/backends/index.ts

// Namespace-style (grouped modules)
export * as Mathx from "./utils/math";
export * as Vec from "./utils/vector";
export * as Rand from "./utils/random";
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
export * as CanvasUtil from "./utils/canvas";
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
} from "./utils/canvas";

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
