// FILE: src/lib/brush/engine.types.ts

// import type { BrushInputConfig } from "@/data/brushPresets";

/* ============================== Enums/Strings ============================== */

/**
 * Concrete backends you implement. Keep this focused on pipelines, not styles.
 * Add a new backend here only when it truly requires a different renderer.
 */
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

export type CurvePoint = {
  /** Domain in [0..1] */
  x: number;
  /** Range in [0..1] */
  y: number;
};

// Accept either editable points or a baked LUT.
export type CurveSource = ReadonlyArray<CurvePoint> | Float32Array;

/** Per-stamp input sample normalized for dynamics (computed at runtime). */
export type BrushInputSample = {
  pressure: number;
  speedNorm: number;
  altitudeDeg?: number; // optional
  azimuthRad?: number; // optional
  tiltShading?: number; // optional
};

/**
 * Legacy/compat rendering modes (used by some older presets/UIs).
 * Prefer `EngineRendering.intent` for new work.
 */
export type RenderingMode = "blended" | "glazed" | "marker" | "spray" | "wet";

/**
 * High-level, user-facing style intent. A resolver can map this to a backend
 * and, if applicable, a backend-local mode (e.g., stamping "ink"/"graphite").
 */
export type RenderingIntent =
  | "ink"
  | "marker"
  | "graphite"
  | "charcoal"
  | "wet"
  | "wash"
  | "smudge"
  | "spray"
  | "pastel"
  | "impasto";

/**
 * Stamping-only variant selector (local to the stamping backend).
 * Use `overrides.renderingMode` to force a stamping variant explicitly.
 */
export type StampingRenderingMode = "ink" | "graphite";

/* ================================= Shapes ================================= */

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
  motion?: "paperLocked" | "tipLocked" | "smudgeLocked" | "animated";
};

export type EngineRendering = {
  /**
   * Legacy/compat. Some UIs still use this; if present, you may map this
   * into `intent` during normalization. Prefer `intent` for new presets.
   */
  mode?: RenderingMode;
  /** High-level style; resolver maps to backend + (optionally) stamping mode. */
  intent?: RenderingIntent;
  wetEdges?: boolean;
  flow?: number; // 0..100
  /** Global blend used when compositing the offscreen stroke layer. */
  blendMode?: CanvasRenderingContext2D["globalCompositeOperation"];
};

/* ============================== Cross-backend Overrides ============================== */

/**
 * Generic, cross-backend overrides. Keep this surface stable & additive.
 * Backends should gracefully ignore fields they don't use.
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
  grainMotion?: "paperLocked" | "tipLocked" | "smudgeLocked" | "animated";

  /* Wet hint */
  wetEdges?: boolean;

  /* Smudge-specific (lightweight aliases; full set can live in backendOverrides.smudge) */
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

  /** Alias for globalCompositeOperation; overrides.rendering.blendMode if present */
  composite?: CanvasRenderingContext2D["globalCompositeOperation"];
  /** Hint: some browsers ignore, but useful for offscreen/workers */
  antialias?: boolean;

  /* -------- Editable curves (all in [0..1] → [0..1]) -------- */
  /** pressure → width multiplier curve (fallback to linear if absent) */
  pressureToWidthCurve?: CurveSource;
  /** pressure → flow/opacity multiplier curve */
  pressureToFlowCurve?: CurveSource;
  /** normalized speed → flow/opacity multiplier curve */
  speedToFlowCurve?: CurveSource;
  /** (optional) normalized speed → width multiplier curve */
  speedToWidthCurve?: CurveSource;

  /** Tilt dynamics (side shading / pencil / charcoal) */
  /** tiltShading (0 upright..1 fully on side) → width gain */
  tiltToWidthCurve?: CurveSource;
  /** tiltShading → flow/opacity gain */
  tiltToFlowCurve?: CurveSource;
  /** shaping exponent for tiltShading (default 1.25). */
  tiltSideShadingExp?: number;

  /** Use stylus azimuth to rotate stamps (calligraphy/technical pen). */
  useAzimuthForRotation?: boolean;

  /**
   * Reference speed for normalizing speed-based curves (px/s).
   * If provided, cores can compute speedNorm = clamp(speed / speedNormRefPxPerSec, 0..1).
   * Sensible default in cores: ~800–1200 px/s for tablet workflows.
   */
  speedNormRefPxPerSec?: number;
};

/* ============================== Backend-specific Overrides ============================== */

/* ---- Stamping ---- */
export type StampingOverrides = {
  mode?: StampingRenderingMode;
  innerGrainAlpha?: number;
  edgeCarveAlpha?: number;

  // split nibs & geometry (duplicated here for clarity/IDE grouping)
  splitCount?: number;
  splitSpacing?: number;
  splitSpacingJitter?: number;
  splitCurvature?: number;
  splitAsymmetry?: number;
  splitScatter?: number;
  splitAngle?: number;
  pressureToSplitSpacing?: number;
  tiltToSplitFan?: number;
};

/* ---- Ribbon ---- */
export type RibbonMode = "pencil" | "ink" | "calligraphy";
export type RibbonOverrides = {
  mode?: RibbonMode;
  coreStrength?: number;

  // glaze & grain
  glazeBlurPx?: number;
  grainDepth?: number;
  grainScale?: number;
  grainRotate?: number;

  // micro jitter
  microJitterPx?: number;
  microJitterFreq?: number;
};

/* ---- Smudge ---- */
export type SmudgeOverrides = {
  smudgeStrength?: number; // 0..2
  smudgeAlpha?: number; // 0..2
  smudgeBlur?: number; // px
  smudgeSpacing?: number; // % or fraction
};

/* ---- Spray ---- */
export type SprayMode = "airbrush" | "splatter" | "nozzle" | "stipple";
export type SprayOverrides = {
  mode?: SprayMode;
  dropletCount?: number;
  dropletJitter?: number;
  dropletSizeMin?: number;
  dropletSizeMax?: number;
};

/* ---- Wet ---- */
export type WetOverrides = {
  // global wet controls
  wetEdges?: boolean; // quick toggle
  diffusion?: number; // 0..2 (base diffusion rate)
  pooling?: number; // 0..2 (pigment pooling intensity)
  pickup?: number; // 0..2 (paper pickup / staining)

  // paper model
  paperTooth?: number; // 0..1
  paperSizing?: number; // 0..1 (resists/accepts water)
  granulation?: number; // 0..1 (graininess in pooling)

  // edges/bloom
  edgeGain?: number; // 0..2 (capillary darkening)
  edgeRadiusPx?: number; // 0.5..6
  bloomGain?: number; // 0..2 (backrun strength)
  bloomThreshold?: number; // 0..1 (when reverse flow kicks in)

  // glaze/wash
  glazeAlpha?: number; // 0..1
  glazeFollowShade?: number; // 0..1

  // lift
  liftStrength?: number; // 0..1

  // performance
  iterations?: number; // diffusion solver steps per frame
  stepPx?: number; // solver grid cell size in CSS px
};

/* ---- Particle (placeholder; extend as you build it) ---- */
export type ParticleOverrides = {
  emitterRate?: number;
  particleSize?: number;
  turbulence?: number;
  drag?: number;
};

/* ---- Pattern (placeholder; extend as you build it) ---- */
export type PatternOverrides = {
  stampTextureId?: string;
  stampScale?: number;
  stampJitter?: number;
};

/* ---- Impasto (placeholder; extend as you build it) ---- */
export type ImpastoMode = "bristle" | "knife" | "glaze" | "rake";

export type ImpastoOverrides = {
  /** Variant selector */
  mode?: ImpastoMode;

  /** Lighting & relief */
  lightAzimuthDeg?: number; // default ~35
  lightElevationDeg?: number; // default ~55
  reliefIntensity?: number; // Sobel->normal intensity, default ~1.5
  ambient?: number; // 0..1, default ~0.25
  specAmount?: number; // 0..1, default ~0.18
  specFromShade?: number; // 0..1, default 1

  /** Height field shaping */
  heightBlurPx?: number; // default ~0.6

  /** Knife-only tweaks */
  knifeAngleGain?: number; // 0..1, default ~0.25

  /** Rake-only tweaks */
  rakeGrooves?: number; // int, default ~4
  rakeSpacing?: number; // px, default ~1.6
};

export type BackendOverrides = {
  stamping?: StampingOverrides;
  ribbon?: RibbonOverrides;
  smudge?: SmudgeOverrides;
  spray?: SprayOverrides;
  wet?: WetOverrides;
  particle?: ParticleOverrides;
  pattern?: PatternOverrides;
  impasto?: ImpastoOverrides;
};

/* ============================== Engine Config ============================== */

export type EngineConfig = {
  /** Bump when you change the config/override surface in breaking ways. */
  version?: number; // default: 1
  backend?: BrushBackend;
  shape?: EngineShape;
  strokePath?: EngineStrokePath;
  grain?: EngineGrain;
  rendering?: EngineRendering;

  /**
   * Generic, cross-backend overrides (small and stable).
   * Avoid stuffing backend-specific controls here—use backendOverrides.
   */
  overrides?: Partial<RenderOverrides>;

  /**
   * Backend-specific, strongly-typed overrides. This keeps deep customization
   * out of the generic surface and avoids accidental cross-pollution.
   */
  backendOverrides?: BackendOverrides;

  /** Reserved for curves/envelopes etc. */
  modulations?: unknown;
};

/* ============================== Render types ============================== */

export type RenderPathPoint = {
  x: number;
  y: number;
  angle?: number;
  /** Full name; kept for clarity and external integrations */
  pressure?: number;
  /** Shorthand used by some samplers/utilities */
  p?: number;
  /** Optional timestamp (ms since epoch or perf.now), if you stream points */
  t?: number;
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

  /** Preferred */
  pixelRatio?: number;
  /** Legacy alias (deprecated) — normalize to pixelRatio if present */
  dpr?: number;

  path?: Array<RenderPathPoint>;

  colorJitter?: { h?: number; s?: number; l?: number; perStamp?: boolean };
  /** Per-stroke runtime overrides (merged over engine.overrides). */
  overrides?: Partial<RenderOverrides>;

  /** Optional per-preset input metadata (pressure curve, smoothing, sampling) */
  input?: BrushInputConfig;
};

export type NormalizedRenderOptions = RenderOptions & {
  engine: Required<Omit<EngineConfig, "modulations">> & {
    modulations?: unknown;
  };
  pixelRatio: number;
  width: number;
  height: number;
  baseSizePx: number;
  color: string;
  input: BrushInputConfig;
};

/* ============================== (Optional) Resolution Types ============================== */
/**
 * If you add a resolver that maps `engine.rendering.intent` to a concrete backend
 * and, for stamping, a concrete `renderingMode`, these types can help you keep it typed.
 */
export type RenderingResolution = {
  backend: Exclude<BrushBackend, "auto">;
  /** Only meaningful when backend === "stamping". */
  stampingMode?: StampingRenderingMode;
};

export type IntentToResolutionMap = Partial<
  Record<RenderingIntent, RenderingResolution>
>;

/* ================= UI Param Types ================= */

export type BrushParamType =
  | "size"
  | "hardness"
  | "flow"
  | "spacing"
  | "smoothing"
  | "angle"
  | "jitterSize"
  | "jitterAngle"
  | "grain"
  | "opacity";

export type BrushParam = {
  key: string;
  label: string;
  type: BrushParamType;
  min?: number;
  max?: number;
  step?: number;
  defaultValue: number;
  /** Hide from UI without removing from schema. */
  show?: boolean;
};

/* ================= Catalog Types ================= */

export type BrushPreset = {
  id: string;
  name: string;
  subtitle?: string;
  params: BrushParam[];
  engine: EngineConfigLike;
  /** Optional discovery/organization tags (e.g., "textured", "thin", "pencil"). */
  tags?: string[];
  /**
   * Optional input pipeline metadata.
   */
  input?: BrushInputConfig;
};

export type BrushCategory = {
  id: string;
  name: string;
  brushes: BrushPreset[];
};

/** Handy id alias for components/selectors. */
export type BrushId = BrushPreset["id"];

/* ================= Input Pipeline Types ================= */

export type PressureCurve =
  | { type: "gamma"; gamma: number }
  | { type: "cubic"; p0: number; p1: number; p2: number; p3: number };

export type PressureSmoothing =
  | { mode: "disabled" }
  | {
      mode: "oneEuro";
      oneEuro: { minCutoff: number; beta: number; dCutoff: number };
    };

export type PressureSynth =
  | { enabled: false }
  | {
      enabled: true;
      /** range of pointer speed in px/s to map into pressure */
      speedRange: [number, number];
      /** clamp range of synthesized pressure */
      minPressure: number; // 0..1
      maxPressure: number; // 0..1
      curve: "linear" | "easeIn" | "easeOut" | "easeInOut";
    };

/**
 * UI-facing input config.
 * (Kept here so engine and UI can both reference it without a circular import.)
 */
export type BrushInputConfig = {
  pressure: {
    clamp: { min: number; max: number };
    curve: PressureCurve;
    smoothing: PressureSmoothing;
    velocityComp?: { k: number; refSpeed: number };
    synth?: PressureSynth;
    gain?: number;
    deadZone?: number; // 0..0.5
  };
  quality?: {
    predictPx?: number;
    speedToSpacing?: number;
    minStepPx?: number;
  };
};

/**
 * Minimal EngineConfig-like shape for presets, so this file doesn’t import engine.types.ts.
 * The real EngineConfig lives in the engine; presets will be validated when loaded.
 */
export type EngineConfigLike = {
  version?: number;
  backend?: string;
  shape?: Record<string, unknown>;
  strokePath?: Record<string, unknown>;
  grain?: Record<string, unknown>;
  rendering?: Record<string, unknown>;
  overrides?: Record<string, unknown>;
  backendOverrides?: Record<string, unknown>;
  modulations?: unknown;
};
