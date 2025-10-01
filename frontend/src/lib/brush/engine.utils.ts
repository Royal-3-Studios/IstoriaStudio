// FILE: src/lib/brush/engine.utils.ts

import { DEFAULT_INPUT } from "@/lib/brush/input";
import type { BrushInputConfig } from "@/data/brushPresets";
import type {
  BrushBackend,
  EngineConfig,
  EngineGrain,
  EngineRendering,
  EngineShape,
  EngineStrokePath,
  NormalizedRenderOptions,
  RenderOptions,
  RenderOverrides,
} from "./engine.types";

/* ============================== Canvas helpers ============================== */

export type Ctx2D =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export function isCanvas2DContext(ctx: unknown): ctx is Ctx2D {
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

export function resolveDevicePixelRatio(pixelRatio?: number): number {
  const sys =
    typeof window !== "undefined" && typeof window.devicePixelRatio === "number"
      ? window.devicePixelRatio
      : 1;
  const pr = pixelRatio ?? sys ?? 1;
  return Math.max(1, Math.min(pr, 2));
}

export function ensureCanvasDprSize(
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

/* ========================== Normalization helpers ========================== */

export function normalizeShape(shape?: EngineShape): Required<EngineShape> {
  const s = shape ?? {};
  return {
    type: s.type ?? "oval",
    angle: s.angle ?? 0,
    softness: s.softness ?? 50,
    roundness: s.roundness ?? 100,
    sizeScale: s.sizeScale ?? 1.0,
  };
}

export function normalizeStrokePath(
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

export function normalizeGrain(grain?: EngineGrain): Required<EngineGrain> {
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

export function normalizeRendering(
  r?: EngineRendering
): Required<EngineRendering> {
  const ren = r ?? {};
  return {
    mode: ren.mode ?? "blended",
    wetEdges: ren.wetEdges ?? false,
    flow: ren.flow ?? 100,
    blendMode: ren.blendMode ?? "source-over",
  };
}

export function mergeOverrides(
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

export function normalizeEngineConfig(
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

export function ensureInput(input?: BrushInputConfig): BrushInputConfig {
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

export function normalizeOptions(opt: RenderOptions): NormalizedRenderOptions {
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

/* ============================ Backend selection ============================ */

export function scoreBackends(
  opts: NormalizedRenderOptions
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

export function pickMax<K extends string>(scores: Record<K, number>): K {
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

export function chooseBackend(
  opts: NormalizedRenderOptions
): Exclude<BrushBackend, "auto"> {
  const cfg = opts.engine;
  if (cfg.backend !== "auto") return cfg.backend; // Respect explicit selection
  const scores = scoreBackends(opts);
  return pickMax(scores);
}
