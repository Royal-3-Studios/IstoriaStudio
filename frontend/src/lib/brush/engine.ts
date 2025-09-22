// FILE: src/lib/brush/engine.ts
/**
 * Brush Engine Orchestrator
 * ------------------------------------------------------------
 * Responsibilities:
 *  - Define shared types for presets, UI, and backends.
 *  - Normalize inputs (DPR, canvas size, color, engine config, overrides).
 *  - Pick an appropriate backend (or respect explicit choice).
 *  - Render into an offscreen layer, then composite with global blend/opacity.
 *
 * Backends supported:
 *  - Canvas-based: ribbon, spray, wet, impasto
 *  - Ctx-based (wrapped with "...ToCanvas"): stamping, smudge, particle, pattern
 */

import { createLayer } from "./backends/utils/canvas";
import { createBrushContext } from "@/lib/brush/core/brushContext";
import { mulberry32 } from "./backends/utils/random";

import {
  withCompositeAndAlpha,
  toCompositeOp,
} from "./backends/utils/blending";

// Canvas-based backends (expect a Canvas)
import { drawRibbonToCanvas } from "./backends/ribbon";
import { drawSprayToCanvas } from "./backends/spray";
import { drawWetToCanvas } from "./backends/wet";
import { drawImpastoToCanvas } from "./backends/impasto";

// Ctx-based backends (provide ...ToCanvas wrappers)
import drawStamping, { drawStampingToCanvas } from "./backends/stamping";
import drawSmudge, { drawSmudgeToCanvas } from "./backends/smudge";
import drawParticle, { drawParticleToCanvas } from "./backends/particle";
import drawPattern, { drawPatternToCanvas } from "./backends/pattern";

// NEW: input config plumbed through engine (pressure curve, smoothing, etc.)
import type { BrushInputConfig } from "@/data/brushPresets";
import { DEFAULT_INPUT } from "@/lib/brush/input";

/* ========================================================================== */
/*                                    Types                                   */
/* ========================================================================== */

export type BrushBackend =
  | "auto"
  | "ribbon"
  | "stamping"
  | "spray"
  | "wet"
  | "smudge"
  | "particle"
  | "pattern"
  | "impasto";

export type RenderingMode = "blended" | "glazed" | "marker" | "spray" | "wet";

export type EngineShape = {
  type?:
    | "oval"
    | "round"
    | "nib"
    | "image"
    | "chisel"
    | "square"
    | "spray"
    | "charcoal";
  angle?: number; // deg
  softness?: number; // 0..100
  roundness?: number; // 0..100
  sizeScale?: number; // scalar
};

export type EngineStrokePath = {
  /** % of diameter per step for stamping/spray; typical 4..20. */
  spacing?: number;
  /** Portion of spacing used to jitter along the path (0..1). */
  jitter?: number;
  /** Scatter orthogonal to path (px). */
  scatter?: number;
  /** Path smoothing / streamline (0..100). */
  streamline?: number;
  /** Stamps per step (multi-nib / split). */
  count?: number;
};

export type EngineGrain = {
  kind?: "none" | "paper" | "canvas" | "noise";
  depth?: number; // 0..100
  scale?: number; // 0.5..3
  rotate?: number; // deg
  motion?: "paperLocked" | "tipLocked" | "smudgeLocked";
};

export type EngineRendering = {
  mode?: RenderingMode;
  wetEdges?: boolean;
  flow?: number; // 0..100
  /** Global blend used when compositing the offscreen stroke layer. */
  blendMode?: CanvasRenderingContext2D["globalCompositeOperation"];
};

/**
 * RenderOverrides also carry input-quality knobs for backends (predictPx / speedToSpacing / minStepPx).
 */
export type RenderOverrides = {
  /* Placement & distribution */
  spacing?: number;
  jitter?: number;
  scatter?: number;
  count?: number;

  /* Tip / orientation */
  angle?: number;
  softness?: number;
  sizeJitter?: number;
  angleJitter?: number;
  angleFollowDirection?: number;

  /* Dynamics */
  flow?: number;
  opacity?: number; // 0..100
  buildup?: boolean;
  coreStrength?: number;

  /* Grain */
  grainKind?: "none" | "paper" | "canvas" | "noise";
  grainScale?: number;
  grainDepth?: number;
  grainRotate?: number;
  grainMotion?: "paperLocked" | "tipLocked" | "smudgeLocked";

  /* Wet hint */
  wetEdges?: boolean;

  /* Smudge-specific */
  smudgeStrength?: number; // 0..2 (movement factor)
  smudgeAlpha?: number; // 0..2 (alpha multiplier)
  smudgeBlur?: number; // px
  smudgeSpacing?: number; // % or fraction

  /* Pencil / rim (used by some backends) */
  centerlinePencil?: boolean;
  rimMode?: "auto" | "on" | "off";
  rimStrength?: number;
  bgIsLight?: boolean;

  /* Paper tooth */
  toothBody?: number;
  toothFlank?: number;
  toothScale?: number;

  /* Stroke geometry (taper/body) */
  tipScaleStart?: number;
  tipScaleEnd?: number;
  tipMinPx?: number;
  bellyGain?: number;
  endBias?: number;
  uniformity?: number;
  tipRoundness?: number;
  thicknessCurve?: number;

  taperProfileStart?:
    | "linear"
    | "easeIn"
    | "easeOut"
    | "easeInOut"
    | "expo"
    | "custom";
  taperProfileEnd?:
    | "linear"
    | "easeIn"
    | "easeOut"
    | "easeInOut"
    | "expo"
    | "custom";
  taperProfileStartCurve?: number[];
  taperProfileEndCurve?: number[];

  /* Split nibs */
  splitCount?: number;
  splitSpacing?: number;
  splitSpacingJitter?: number;
  splitCurvature?: number;
  splitAsymmetry?: number;
  splitScatter?: number;
  splitAngle?: number;
  pressureToSplitSpacing?: number;
  tiltToSplitFan?: number;

  /* Speed dynamics */
  speedToWidth?: number;
  speedToFlow?: number;
  speedSmoothingMs?: number;

  /* Tilt routing */
  tiltToSize?: number;
  tiltToFan?: number;
  tiltToGrainScale?: number;
  tiltToEdgeNoise?: number;

  /* Edge noise / dry fringe */
  edgeNoiseStrength?: number;
  edgeNoiseScale?: number;
  dryThreshold?: number;

  /* Extra knobs (future-proof; optional in backends) */
  innerGrainAlpha?: number; // 0..1
  edgeCarveAlpha?: number; // 0..1

  /* ------- Input quality knobs (consumed by stroke samplers) ------- */
  /** Predictive forward nudge in CSS px (0 disables). */
  predictPx?: number;
  /**
   * Velocity → spacing gain (−0.3..+0.5). Positive loosens spacing at speed,
   * negative tightens. Backends pass to stroke.ts stepping modulation.
   */
  speedToSpacing?: number;
  /** Minimum absolute step in px after modulation. */
  minStepPx?: number;
};

export type EngineConfig = {
  /** Bump when you change the config/override surface in breaking ways. */
  version?: number; // default: 1
  backend?: BrushBackend;
  shape?: EngineShape;
  strokePath?: EngineStrokePath;
  grain?: EngineGrain;
  rendering?: EngineRendering;
  overrides?: Partial<RenderOverrides>;
  /** Reserved for curves/envelopes etc. */
  modulations?: unknown;
};

export type RenderPathPoint = {
  x: number;
  y: number;
  angle?: number;
  pressure?: number;
  tilt?: number;
};

export type RenderOptions = {
  engine: EngineConfig;
  /** Nominal diameter (CSS px) before shape.sizeScale. */
  baseSizePx: number;

  color?: string; // hex "#000000"
  width: number; // CSS px
  height: number; // CSS px
  seed?: number;
  pixelRatio?: number;

  path?: Array<RenderPathPoint>;

  colorJitter?: { h?: number; s?: number; l?: number; perStamp?: boolean };
  /** Per-stroke runtime overrides (merged over engine.overrides). */
  overrides?: Partial<RenderOverrides>;

  /** NEW: optional per-preset input metadata (pressure curve, smoothing, sampling) */
  input?: BrushInputConfig;
};

/* ========================================================================== */
/*                                   Helpers                                  */
/* ========================================================================== */

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function isCanvas2DContext(ctx: unknown): ctx is Ctx2D {
  return (
    !!ctx &&
    typeof (ctx as CanvasRenderingContext2D).setTransform === "function" &&
    typeof (ctx as CanvasRenderingContext2D).clearRect === "function" &&
    typeof (ctx as CanvasRenderingContext2D).drawImage === "function"
  );
}

/** Create a DOM-based canvas (prefer createLayer() for offscreen). */
export function createDomCanvas(
  width: number,
  height: number
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.floor(width));
  c.height = Math.max(1, Math.floor(height));
  return c;
}

function resolveDevicePixelRatio(pixelRatio?: number): number {
  const sys =
    typeof window !== "undefined" && typeof window.devicePixelRatio === "number"
      ? window.devicePixelRatio
      : 1;
  const pr = pixelRatio ?? sys ?? 1;
  return Math.max(1, Math.min(pr, 2));
}

function ensureCanvasDprSize(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  dpr: number
): void {
  const w = Math.max(1, Math.floor(cssWidth * dpr));
  const h = Math.max(1, Math.floor(cssHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  if (canvas.style.width === "" || canvas.style.height === "") {
    canvas.style.width = `${Math.max(1, Math.floor(cssWidth))}px`;
    canvas.style.height = `${Math.max(1, Math.floor(cssHeight))}px`;
  }
}

/* ========================================================================== */
/*                         Normalization (Config & Overrides)                 */
/* ========================================================================== */

function normalizeShape(shape?: EngineShape): Required<EngineShape> {
  const s = shape ?? {};
  return {
    type: s.type ?? "oval",
    angle: s.angle ?? 0,
    softness: s.softness ?? 50,
    roundness: s.roundness ?? 100,
    sizeScale: s.sizeScale ?? 1.0,
  };
}

function normalizeStrokePath(
  path?: EngineStrokePath
): Required<EngineStrokePath> {
  const p = path ?? {};
  return {
    spacing: p.spacing ?? 6,
    jitter: p.jitter ?? 0.5,
    scatter: p.scatter ?? 0,
    streamline: p.streamline ?? 22,
    count: Math.max(1, Math.round(p.count ?? 1)),
  };
}

function normalizeGrain(grain?: EngineGrain): Required<EngineGrain> {
  const g = grain ?? {};
  return {
    kind: g.kind ?? "none",
    depth: g.depth ?? 0,
    scale: g.scale ?? 1.0,
    rotate: g.rotate ?? 0,
    motion: (g.motion ?? "paperLocked") as
      | "paperLocked"
      | "tipLocked"
      | "smudgeLocked",
  };
}

function normalizeRendering(r?: EngineRendering): Required<EngineRendering> {
  const ren = r ?? {};
  return {
    mode: ren.mode ?? "blended",
    wetEdges: ren.wetEdges ?? false,
    flow: ren.flow ?? 100,
    blendMode: ren.blendMode ?? "source-over",
  };
}

function mergeOverrides(
  engineDefaults: Partial<RenderOverrides> | undefined,
  runtime: Partial<RenderOverrides> | undefined
): Required<RenderOverrides> {
  const e = engineDefaults ?? {};
  const u = runtime ?? {};

  const DEF: Required<RenderOverrides> = {
    /* Placement */
    spacing: 4,
    jitter: 0.5,
    scatter: 0,
    count: 1,

    /* Tip / orientation */
    angle: 0,
    softness: 50,
    sizeJitter: 0,
    angleJitter: 0,
    angleFollowDirection: 0,

    /* Dynamics */
    flow: 100,
    opacity: 100,
    buildup: false,
    coreStrength: 140,

    /* Grain */
    grainKind: "none",
    grainScale: 1.0,
    grainDepth: 0,
    grainRotate: 0,
    grainMotion: "paperLocked",

    /* Wet hint */
    wetEdges: false,

    /* Pencil / rim */
    centerlinePencil: false,
    rimMode: "auto",
    rimStrength: 0.18,
    bgIsLight: true,

    /* Paper tooth */
    toothBody: 0.55,
    toothFlank: 0.9,
    toothScale: 0,

    /* Stroke geometry */
    tipScaleStart: 0.85,
    tipScaleEnd: 0.85,
    tipMinPx: 0,
    bellyGain: 1.0,
    endBias: 0.0,
    uniformity: 0.0,
    tipRoundness: 0.0,
    thicknessCurve: 1.0,

    taperProfileStart: "easeOut",
    taperProfileEnd: "easeIn",
    taperProfileStartCurve: [],
    taperProfileEndCurve: [],

    /* Split nibs */
    splitCount: 1,
    splitSpacing: 0,
    splitSpacingJitter: 0,
    splitCurvature: 0,
    splitAsymmetry: 0,
    splitScatter: 0,
    splitAngle: 0,
    pressureToSplitSpacing: 0,
    tiltToSplitFan: 0,

    /* Speed */
    speedToWidth: 0,
    speedToFlow: 0,
    speedSmoothingMs: 30,

    /* Tilt routing */
    tiltToSize: 0,
    tiltToFan: 0,
    tiltToGrainScale: 0,
    tiltToEdgeNoise: 0,

    /* Edge noise / dry fringe */
    edgeNoiseStrength: 0,
    edgeNoiseScale: 8,
    dryThreshold: 0.0,

    /* Extra knobs */
    innerGrainAlpha: 0.55,
    edgeCarveAlpha: 0.26,

    /* Smudge defaults */
    smudgeStrength: 0.65,
    smudgeAlpha: 0.85,
    smudgeBlur: 0,
    smudgeSpacing: 6,

    /* Input-quality */
    predictPx: 0,
    speedToSpacing: 0,
    minStepPx: 0.5,
  };

  return {
    spacing: u.spacing ?? e.spacing ?? DEF.spacing,
    jitter: u.jitter ?? e.jitter ?? DEF.jitter,
    scatter: u.scatter ?? e.scatter ?? DEF.scatter,
    count: Math.max(1, Math.round(u.count ?? e.count ?? DEF.count)),
    sizeJitter: u.sizeJitter ?? e.sizeJitter ?? DEF.sizeJitter,

    angle: u.angle ?? e.angle ?? DEF.angle,
    softness: u.softness ?? e.softness ?? DEF.softness,
    angleJitter: u.angleJitter ?? e.angleJitter ?? DEF.angleJitter,
    angleFollowDirection:
      u.angleFollowDirection ??
      e.angleFollowDirection ??
      DEF.angleFollowDirection,

    flow: u.flow ?? e.flow ?? DEF.flow,
    opacity: u.opacity ?? e.opacity ?? DEF.opacity,
    buildup: u.buildup ?? e.buildup ?? DEF.buildup,
    coreStrength: u.coreStrength ?? e.coreStrength ?? DEF.coreStrength,

    grainKind: u.grainKind ?? e.grainKind ?? DEF.grainKind,
    grainScale: u.grainScale ?? e.grainScale ?? DEF.grainScale,
    grainDepth: u.grainDepth ?? e.grainDepth ?? DEF.grainDepth,
    grainRotate: u.grainRotate ?? e.grainRotate ?? DEF.grainRotate,
    grainMotion: (u.grainMotion ?? e.grainMotion ?? DEF.grainMotion) as
      | "paperLocked"
      | "tipLocked"
      | "smudgeLocked",

    wetEdges: u.wetEdges ?? e.wetEdges ?? DEF.wetEdges,

    centerlinePencil:
      u.centerlinePencil ?? e.centerlinePencil ?? DEF.centerlinePencil,
    rimMode: (u.rimMode ?? e.rimMode ?? DEF.rimMode) as "auto" | "on" | "off",
    rimStrength: u.rimStrength ?? e.rimStrength ?? DEF.rimStrength,
    bgIsLight: u.bgIsLight ?? e.bgIsLight ?? DEF.bgIsLight,

    toothBody: u.toothBody ?? e.toothBody ?? DEF.toothBody,
    toothFlank: u.toothFlank ?? e.toothFlank ?? DEF.toothFlank,
    toothScale: u.toothScale ?? e.toothScale ?? DEF.toothScale,

    tipScaleStart: u.tipScaleStart ?? e.tipScaleStart ?? DEF.tipScaleStart,
    tipScaleEnd: u.tipScaleEnd ?? e.tipScaleEnd ?? DEF.tipScaleEnd,
    tipMinPx: u.tipMinPx ?? e.tipMinPx ?? DEF.tipMinPx,
    bellyGain: u.bellyGain ?? e.bellyGain ?? DEF.bellyGain,
    endBias: u.endBias ?? e.endBias ?? DEF.endBias,
    uniformity: u.uniformity ?? e.uniformity ?? DEF.uniformity,
    tipRoundness: u.tipRoundness ?? e.tipRoundness ?? DEF.tipRoundness,
    thicknessCurve: u.thicknessCurve ?? e.thicknessCurve ?? DEF.thicknessCurve,

    taperProfileStart:
      u.taperProfileStart ?? e.taperProfileStart ?? DEF.taperProfileStart,
    taperProfileEnd:
      u.taperProfileEnd ?? e.taperProfileEnd ?? DEF.taperProfileEnd,
    taperProfileStartCurve:
      u.taperProfileStartCurve ??
      e.taperProfileStartCurve ??
      DEF.taperProfileStartCurve,
    taperProfileEndCurve:
      u.taperProfileEndCurve ??
      e.taperProfileEndCurve ??
      DEF.taperProfileEndCurve,

    splitCount: Math.max(
      1,
      Math.round(u.splitCount ?? e.splitCount ?? DEF.splitCount)
    ),
    splitSpacing: u.splitSpacing ?? e.splitSpacing ?? DEF.splitSpacing,
    splitSpacingJitter:
      u.splitSpacingJitter ?? e.splitSpacingJitter ?? DEF.splitSpacingJitter,
    splitCurvature: u.splitCurvature ?? e.splitCurvature ?? DEF.splitCurvature,
    splitAsymmetry: u.splitAsymmetry ?? e.splitAsymmetry ?? DEF.splitAsymmetry,
    splitScatter: u.splitScatter ?? e.splitScatter ?? DEF.splitScatter,
    splitAngle: u.splitAngle ?? e.splitAngle ?? DEF.splitAngle,
    pressureToSplitSpacing:
      u.pressureToSplitSpacing ??
      e.pressureToSplitSpacing ??
      DEF.pressureToSplitSpacing,
    tiltToSplitFan: u.tiltToSplitFan ?? e.tiltToSplitFan ?? DEF.tiltToSplitFan,

    speedToWidth: u.speedToWidth ?? e.speedToWidth ?? DEF.speedToWidth,
    speedToFlow: u.speedToFlow ?? e.speedToFlow ?? DEF.speedToFlow,
    speedSmoothingMs: Math.max(
      0,
      Math.round(
        u.speedSmoothingMs ?? e.speedSmoothingMs ?? DEF.speedSmoothingMs
      )
    ),

    tiltToSize: u.tiltToSize ?? e.tiltToSize ?? DEF.tiltToSize,
    tiltToFan: u.tiltToFan ?? e.tiltToFan ?? DEF.tiltToFan,
    tiltToGrainScale:
      u.tiltToGrainScale ?? e.tiltToGrainScale ?? DEF.tiltToGrainScale,
    tiltToEdgeNoise:
      u.tiltToEdgeNoise ?? e.tiltToEdgeNoise ?? DEF.tiltToEdgeNoise,

    edgeNoiseStrength:
      u.edgeNoiseStrength ?? e.edgeNoiseStrength ?? DEF.edgeNoiseStrength,
    edgeNoiseScale: u.edgeNoiseScale ?? e.edgeNoiseScale ?? DEF.edgeNoiseScale,
    dryThreshold: u.dryThreshold ?? e.dryThreshold ?? DEF.dryThreshold,

    innerGrainAlpha:
      u.innerGrainAlpha ?? e.innerGrainAlpha ?? DEF.innerGrainAlpha,
    edgeCarveAlpha: u.edgeCarveAlpha ?? e.edgeCarveAlpha ?? DEF.edgeCarveAlpha,

    smudgeStrength: u.smudgeStrength ?? e.smudgeStrength ?? DEF.smudgeStrength,
    smudgeAlpha: u.smudgeAlpha ?? e.smudgeAlpha ?? DEF.smudgeAlpha,
    smudgeBlur: u.smudgeBlur ?? e.smudgeBlur ?? DEF.smudgeBlur,
    smudgeSpacing: u.smudgeSpacing ?? e.smudgeSpacing ?? DEF.smudgeSpacing,

    /* Input-quality */
    predictPx: u.predictPx ?? e.predictPx ?? DEF.predictPx,
    speedToSpacing: u.speedToSpacing ?? e.speedToSpacing ?? DEF.speedToSpacing,
    minStepPx: u.minStepPx ?? e.minStepPx ?? DEF.minStepPx,
  };
}

function normalizeEngineConfig(
  cfg: EngineConfig | undefined
): Required<EngineConfig> {
  const engine = cfg ?? {};
  return {
    version: engine.version ?? 1,
    backend: engine.backend ?? "auto",
    shape: normalizeShape(engine.shape),
    strokePath: normalizeStrokePath(engine.strokePath),
    grain: normalizeGrain(engine.grain),
    rendering: normalizeRendering(engine.rendering),
    overrides: mergeOverrides(engine.overrides, undefined),
    modulations: engine.modulations ?? null,
  };
}

function ensureInput(input?: BrushInputConfig): BrushInputConfig {
  // Shallow, defensive merge against defaults
  return {
    pressure: {
      clamp: {
        min: input?.pressure?.clamp?.min ?? DEFAULT_INPUT.pressure.clamp.min,
        max: input?.pressure?.clamp?.max ?? DEFAULT_INPUT.pressure.clamp.max,
      },
      curve: input?.pressure?.curve ?? DEFAULT_INPUT.pressure.curve,
      smoothing: input?.pressure?.smoothing ?? DEFAULT_INPUT.pressure.smoothing,
      velocityComp:
        input?.pressure?.velocityComp ?? DEFAULT_INPUT.pressure.velocityComp,
      synth: input?.pressure?.synth ?? DEFAULT_INPUT.pressure.synth,
    },
    quality: {
      predictPx: input?.quality?.predictPx ?? DEFAULT_INPUT.quality.predictPx,
      speedToSpacing:
        input?.quality?.speedToSpacing ?? DEFAULT_INPUT.quality.speedToSpacing,
      minStepPx: input?.quality?.minStepPx ?? DEFAULT_INPUT.quality.minStepPx,
    },
  };
}

function normalizeOptions(opt: RenderOptions): RenderOptions & {
  engine: Required<EngineConfig>;
  pixelRatio: number;
  width: number;
  height: number;
  baseSizePx: number;
  color: string;
  input: BrushInputConfig;
} {
  const engine = normalizeEngineConfig(opt.engine);
  const pixelRatio = resolveDevicePixelRatio(opt.pixelRatio);

  const width = Math.max(1, Math.floor(opt.width));
  const height = Math.max(1, Math.floor(opt.height));
  const baseSizePx = Math.max(1, opt.baseSizePx);

  // Merge runtime overrides on top of normalized engine overrides
  const overrides = mergeOverrides(engine.overrides, opt.overrides);

  // Resolve input config (pressure curve + quality)
  const input = ensureInput(opt.input);

  return {
    ...opt,
    pixelRatio,
    width,
    height,
    baseSizePx,
    color: opt.color ?? "#000000",
    engine: {
      ...engine,
      overrides,
    },
    input,
  };
}

/* ========================================================================== */
/*                              Backend Scoring (auto)                        */
/* ========================================================================== */

type NormalizedOpts = RenderOptions & { engine: Required<EngineConfig> };

function scoreBackends(
  opts: NormalizedOpts
): Record<Exclude<BrushBackend, "auto">, number> {
  const { engine: cfg } = opts;
  const ui = opts.overrides ?? {};
  const ov = cfg.overrides;

  const mode = cfg.rendering.mode;
  const shape = cfg.shape.type;

  const wetEdges =
    cfg.rendering.wetEdges || ui.wetEdges === true || ov.wetEdges === true;

  const scatter = Math.max(
    ui.scatter ?? cfg.strokePath.scatter ?? ov.scatter ?? 0,
    0
  );
  const count = Math.max(
    1,
    Math.round(ui.count ?? cfg.strokePath.count ?? ov.count ?? 1)
  );
  const spacing = Math.max(
    0,
    ui.spacing ?? cfg.strokePath.spacing ?? ov.spacing ?? 6
  );

  const softness = Math.max(0, ui.softness ?? ov.softness ?? 50);
  const angleJitter = Math.max(0, ui.angleJitter ?? ov.angleJitter ?? 0);

  const smudgeStrength = Math.max(
    0,
    ui.smudgeStrength ?? ov.smudgeStrength ?? 0
  );
  const grainKind = (ui.grainKind ??
    ov.grainKind ??
    cfg.grain.kind ??
    "none") as EngineGrain["kind"];
  const grainDepth = Math.max(
    0,
    ui.grainDepth ?? ov.grainDepth ?? cfg.grain.depth ?? 0
  );

  // Derived hints
  const wantsSpray =
    mode === "spray" || shape === "spray" || scatter >= 12 || count >= 12;
  const wantsMarker = mode === "marker";
  const wantsWet = mode === "wet" || wetEdges;
  const hasGrain =
    grainKind !== "none" && (grainDepth > 0 || mode === "glazed");

  const S: Record<Exclude<BrushBackend, "auto">, number> = {
    ribbon: 0,
    stamping: 0,
    spray: 0,
    wet: 0,
    smudge: 0,
    particle: 0,
    pattern: 0,
    impasto: 0,
  };

  // Wet
  if (wantsWet) S.wet += 10;
  S.wet += Math.min(10, (softness / 100) * 2);

  // Smudge
  if (smudgeStrength > 0.05) S.smudge += 9;
  if (softness > 60 && spacing <= 6) S.smudge += 2;

  // Spray
  if (wantsSpray) S.spray += 9;
  if (angleJitter >= 10 && scatter >= 6) S.spray += 2;

  // Particle (fine/grainy scatter)
  if (!wantsSpray && angleJitter >= 6 && scatter >= 2 && scatter < 14)
    S.particle += 5;

  // Pattern (pattern/grain fill)
  if (hasGrain) S.pattern += 5;
  if (wantsMarker && hasGrain) S.pattern += 2;

  // Ribbon (marker/ink continuous silhouette)
  if (wantsMarker) S.ribbon += 7;
  if (
    (shape === "nib" || shape === "chisel" || shape === "oval") &&
    scatter < 4 &&
    count <= 3
  ) {
    S.ribbon += 3;
  }
  if (spacing <= 4) S.ribbon += 1;

  // Impasto (light nudge via painterly/glazed + canvas grain)
  if (mode === "glazed" && grainKind === "canvas") S.impasto += 1;

  // Stamping (safe default baseline)
  S.stamping += 3;
  const splitCount = Math.max(
    1,
    Math.round(ui.splitCount ?? ov.splitCount ?? 1)
  );
  if (splitCount > 1) S.stamping += 2;

  return S;
}

function pickMax<K extends string>(scores: Record<K, number>): K {
  let bestK: K = Object.keys(scores)[0] as K;
  let bestV = -Infinity;
  for (const k in scores) {
    const v = scores[k];
    if (v > bestV) {
      bestV = v;
      bestK = k as K;
    }
  }
  return bestK;
}

/* ========================================================================== */
/*                              Backend Selection                             */
/* ========================================================================== */

function chooseBackend(
  opts: RenderOptions & { engine: Required<EngineConfig> }
): Exclude<BrushBackend, "auto"> {
  const cfg = opts.engine;
  if (cfg.backend !== "auto") return cfg.backend; // Respect explicit selection

  const scores = scoreBackends(opts as NormalizedOpts);
  return pickMax(scores);
}

/* ========================================================================== */
/*                                Orchestration                               */
/* ========================================================================== */

export async function drawStrokeToCanvas(
  canvas: HTMLCanvasElement,
  opt: RenderOptions
): Promise<void> {
  // Normalize & choose backend
  const nopt = normalizeOptions(opt);
  const brushCtx = createBrushContext({
    width: nopt.width,
    height: nopt.height,
    dpr: nopt.pixelRatio,
    seed: nopt.seed ?? 1,
    colorHex: nopt.color,
    speedSmoothingMs: nopt.engine.overrides.speedSmoothingMs,
    smudgeDefaults: {
      strength: nopt.engine.overrides.smudgeStrength,
      alphaMul: nopt.engine.overrides.smudgeAlpha,
      blurPx: nopt.engine.overrides.smudgeBlur,
      spacingOverride: nopt.engine.overrides.smudgeSpacing,
    },
    rngFactory: (s) => mulberry32(s),
  });

  // Extend the options object you pass to backends with BrushContext + Input
  const optWithCtx = {
    ...nopt,
    brushCtx,
    input: nopt.input, // <-- backends can consume pressure curve / quality now
  } as typeof nopt & {
    brushCtx: typeof brushCtx;
    input: BrushInputConfig;
  };

  const backend = chooseBackend(nopt);

  // Target canvas DPR sizing
  const dpr = nopt.pixelRatio;
  ensureCanvasDprSize(canvas, nopt.width, nopt.height, dpr);

  // Prepare target 2D context
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!isCanvas2DContext(ctx)) throw new Error("2D context unavailable");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, nopt.width, nopt.height);

  // Offscreen layer to composite at the end
  const layer = createLayer(
    Math.max(1, Math.floor(nopt.width * dpr)),
    Math.max(1, Math.floor(nopt.height * dpr))
  );
  const lctx = layer.getContext("2d", { alpha: true });
  if (!isCanvas2DContext(lctx)) throw new Error("2D layer context unavailable");
  lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  lctx.clearRect(0, 0, nopt.width, nopt.height);

  // Dispatch — canvas-based draw directly to the offscreen layer
  switch (backend) {
    case "ribbon":
      await drawRibbonToCanvas(layer as HTMLCanvasElement, optWithCtx);
      break;
    case "spray":
      await drawSprayToCanvas(layer as HTMLCanvasElement, optWithCtx);
      break;
    case "wet":
      await drawWetToCanvas(layer as HTMLCanvasElement, optWithCtx);
      break;
    case "stamping":
      if (typeof drawStampingToCanvas === "function") {
        await drawStampingToCanvas(layer as HTMLCanvasElement, optWithCtx);
      } else {
        await drawStamping(lctx, optWithCtx);
      }
      break;
    case "smudge":
      if (typeof drawSmudgeToCanvas === "function") {
        await drawSmudgeToCanvas(layer as HTMLCanvasElement, optWithCtx);
      } else {
        await drawSmudge(lctx, optWithCtx);
      }
      break;
    case "particle":
      if (typeof drawParticleToCanvas === "function") {
        await drawParticleToCanvas(layer as HTMLCanvasElement, optWithCtx);
      } else {
        await drawParticle(lctx, optWithCtx);
      }
      break;
    case "pattern":
      if (typeof drawPatternToCanvas === "function") {
        await drawPatternToCanvas(layer as HTMLCanvasElement, optWithCtx);
      } else {
        await drawPattern(lctx, optWithCtx);
      }
      break;
    case "impasto":
      await drawImpastoToCanvas(layer as HTMLCanvasElement, optWithCtx);
      break;
    default:
      if (typeof drawStampingToCanvas === "function") {
        await drawStampingToCanvas(layer as HTMLCanvasElement, optWithCtx);
      } else {
        await drawStamping(lctx, optWithCtx);
      }
      break;
  }

  // Global composite: blendMode + opacity
  const blend = nopt.engine.rendering.blendMode ?? "source-over";
  const opacity01 = Math.max(
    0,
    Math.min(1, (nopt.engine.overrides.opacity ?? 100) / 100)
  );

  withCompositeAndAlpha(ctx, toCompositeOp(blend), opacity01, () => {
    // ctx is already scaled to DPR; draw in CSS space
    ctx.drawImage(layer as CanvasImageSource, 0, 0, nopt.width, nopt.height);
  });
}

/** Backward-compatible alias */
export const renderBrushPreview = drawStrokeToCanvas;
export default drawStrokeToCanvas;
export type NormalizedRenderOptions = ReturnType<typeof normalizeOptions>;
