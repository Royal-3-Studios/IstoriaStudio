// FILE: src/lib/brush/engine.ts
/**
 * Brush engine orchestrator:
 * - Unifies types used by UI (BrushSettings) and presets
 * - Picks a backend: ribbon | stamping | spray | wet | smudge | particle | pattern | impasto | auto
 * - Normalizes DPR, color, size, and merges overrides safely
 * - Forwards options to the selected backend (ctx-based vs canvas-based)
 */

import { drawRibbonToCanvas } from "./backends/ribbon";
import { drawSprayToCanvas } from "./backends/spray";
import { drawWetToCanvas } from "./backends/wet";

// ctx-based backends
import drawStamping from "./backends/stamping";
import drawSmudge from "./backends/smudge";
import drawParticle from "./backends/particle";
import drawPattern from "./backends/pattern";
import drawImpasto from "./backends/impasto";

/* ============================== Types =============================== */

import type {
  BrushBackend,
  RenderingMode,
  GrainMotion,
  TaperProfile,
  CurvePoint,
  ModInput,
  ModTarget,
  EngineModulations,
} from "@/lib/brush/core/types";

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
  spacing?: number; // % of diameter for stamping/spray
  jitter?: number; // % of spacing for stamping/spray
  scatter?: number; // px normal to path
  streamline?: number; // % path smoothing
  count?: number; // stamps per step (1+)
};

export type EngineGrain = {
  kind?: "none" | "paper" | "canvas" | "noise";
  depth?: number; // 0..100
  scale?: number; // 0.5..3
  rotate?: number; // deg
};

export type EngineRendering = {
  mode?: RenderingMode;
  wetEdges?: boolean;
  flow?: number; // 0..100
};

/* ===== Advanced modulation system (additive and backwards-compatible) ===== */

export type ModRoute = {
  input: ModInput;
  target: ModTarget;
  /** Scalar after curve (applied per mode). -1..+1 typical. */
  amount?: number;
  /** How to combine with base value. */
  mode?: "add" | "mul" | "replace";
  /** Optional remap LUT; if absent, linear. */
  curve?: CurvePoint[];
  /** Optional post-curve clamp. */
  min?: number;
  max?: number;
};

/**
 * RenderOverrides:
 * These are the runtime knobs (merged from preset defaults + UI values)
 * that backends can read. All fields are optional for callers; we fill
 * defaults in mergeOverrides().
 */
export type RenderOverrides = {
  /* -------- Placement -------- */
  spacing?: number; // %
  jitter?: number; // %
  scatter?: number; // px
  count?: number; // integer

  /* -------- Tip / orientation -------- */
  angle?: number; // deg
  softness?: number; // 0..100
  /** Per-stamp random rotation jitter (deg). */
  angleJitter?: number; // 0..180
  /** 0..1: 0=no follow, 1=fully align tip to path direction. */
  angleFollowDirection?: number;

  /* -------- Dynamics -------- */
  flow?: number; // 0..100
  /** Separate from flow; caps composited output opacity. */
  opacity?: number; // 0..100
  /** If true, holding the stamp builds up (airbrush behavior). */
  buildup?: boolean;
  coreStrength?: number; // ribbon intensity

  /* -------- Grain -------- */
  grainKind?: "none" | "paper" | "canvas" | "noise";
  grainScale?: number; // 0.5..3
  grainDepth?: number; // 0..100
  grainRotate?: number; // deg
  grainMotion?: GrainMotion;

  /* -------- Wet rendering hint -------- */
  wetEdges?: boolean;

  /* -------- Pencil / rim lighting -------- */
  centerlinePencil?: boolean;
  rimMode?: "auto" | "on" | "off";
  rimStrength?: number; // 0..1
  bgIsLight?: boolean;

  /* -------- Paper tooth (graphite/charcoal) -------- */
  toothBody?: number; // 0..1
  toothFlank?: number; // 0..1
  toothScale?: number; // px (0 = auto from diameter)

  /* -------- Stroke geometry (taper/body) -------- */
  /** 0..1: how much the START tip narrows (0=none, 1=sharp) */
  tipScaleStart?: number;
  /** 0..1: how much the END tip narrows (0=none, 1=sharp) */
  tipScaleEnd?: number;
  /** px: minimum tip width clamp (0 = none) */
  tipMinPx?: number;
  /** 0.5..2: multiplies belly thickness (1 = neutral) */
  bellyGain?: number;
  /** -1..1: makes start(-) or end(+) thicker */
  endBias?: number;
  /** 0..1: pushes thickness toward center (0=normal, 1=uniform marker) */
  uniformity?: number;

  /** 0..1: round the tip profile (0=pointier, 1=rounder) */
  tipRoundness?: number;
  /** 0.2..3: global thickness curve shaping (1 = neutral) */
  thicknessCurve?: number;

  /** Taper shape controls (ease/exp/custom curves) */
  taperProfileStart?: TaperProfile;
  taperProfileEnd?: TaperProfile;
  taperProfileStartCurve?: CurvePoint[]; // when 'custom'
  taperProfileEndCurve?: CurvePoint[]; // when 'custom'

  /* -------- Split nibs / multi-track -------- */
  splitCount?: number; // 1..16
  splitSpacing?: number; // px between tracks
  splitSpacingJitter?: number; // 0..100 (% of spacing)
  splitCurvature?: number; // -1..+1 (fan bend)
  splitAsymmetry?: number; // -1..+1 (offset bias)
  splitScatter?: number; // px random normal scatter
  splitAngle?: number; // deg base fan rotation

  /* Pressure/tilt routing into split layout */
  pressureToSplitSpacing?: number; // 0..1
  tiltToSplitFan?: number; // deg

  /* -------- Speed dynamics (stroke velocity) -------- */
  speedToWidth?: number; // -1..+1
  speedToFlow?: number; // -1..+1
  speedSmoothingMs?: number; // ms averaging

  /* -------- Tilt routing -------- */
  tiltToSize?: number; // -1..+1
  tiltToFan?: number; // -1..+1 (generic fan)
  tiltToGrainScale?: number; // -1..+1
  tiltToEdgeNoise?: number; // -1..+1

  /* -------- Edge noise / dry fringe -------- */
  edgeNoiseStrength?: number; // 0..1
  edgeNoiseScale?: number; // 2..64 px (noise period)
  dryThreshold?: number; // 0..1 (flow under this -> dry)
};

export type EngineConfig = {
  backend?: BrushBackend; // if "auto", we pick via heuristics
  shape?: EngineShape;
  strokePath?: EngineStrokePath;
  grain?: EngineGrain;
  rendering?: EngineRendering;
  overrides?: Partial<RenderOverrides>; // engine defaults
  /** Advanced modulation routes (optional). */
  modulations?: EngineModulations;
};

/** Back-compat alias */
export type BrushEngineConfig = EngineConfig;

export type RenderPathPoint = {
  x: number;
  y: number;
  angle?: number;
  pressure?: number;
  tilt?: number;
};

export type RenderOptions = {
  engine: EngineConfig;
  baseSizePx: number; // diameter in CSS px
  color?: string; // hex "#000000"
  width: number; // CSS px
  height: number; // CSS px
  seed?: number;
  pixelRatio?: number;

  path?: Array<RenderPathPoint>;

  colorJitter?: { h?: number; s?: number; l?: number; perStamp?: boolean };
  overrides?: Partial<RenderOverrides>;
};

/* ============================== Utils =============================== */

function resolveDpr(pixelRatio?: number): number {
  if (typeof window !== "undefined") {
    const sys =
      typeof window.devicePixelRatio === "number" ? window.devicePixelRatio : 1;
    const pr = pixelRatio ?? sys ?? 1;
    return Math.max(1, Math.min(pr, 2));
  }
  const pr = pixelRatio ?? 1;
  return Math.max(1, Math.min(pr, 2));
}

function mergeOverrides(
  engineDefaults: Partial<RenderOverrides> | undefined,
  ui: Partial<RenderOverrides> | undefined
): Required<RenderOverrides> {
  const e = engineDefaults ?? {};
  const u = ui ?? {};

  // Central default values — tuned to be visually neutral.
  const DEF: Required<RenderOverrides> = {
    /* placement */
    spacing: 4,
    jitter: 0.5,
    scatter: 0,
    count: 1,

    /* tip/orientation */
    angle: 0,
    softness: 50,
    angleJitter: 0,
    angleFollowDirection: 0,

    /* dynamics */
    flow: 100,
    opacity: 100,
    buildup: false,
    coreStrength: 140,

    /* grain */
    grainKind: "none",
    grainScale: 1.0,
    grainDepth: 0,
    grainRotate: 0,
    grainMotion: "paperLocked",

    /* wet */
    wetEdges: false,

    /* rim / pencil */
    centerlinePencil: false,
    rimMode: "auto",
    rimStrength: 0.18,
    bgIsLight: true,

    /* paper tooth */
    toothBody: 0.55,
    toothFlank: 0.9,
    toothScale: 0,

    /* stroke geometry */
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

    /* split nibs */
    splitCount: 1,
    splitSpacing: 0,
    splitSpacingJitter: 0,
    splitCurvature: 0,
    splitAsymmetry: 0,
    splitScatter: 0,
    splitAngle: 0,

    pressureToSplitSpacing: 0,
    tiltToSplitFan: 0,

    /* speed dynamics */
    speedToWidth: 0,
    speedToFlow: 0,
    speedSmoothingMs: 30,

    /* tilt routing */
    tiltToSize: 0,
    tiltToFan: 0,
    tiltToGrainScale: 0,
    tiltToEdgeNoise: 0,

    /* edge noise */
    edgeNoiseStrength: 0,
    edgeNoiseScale: 8,
    dryThreshold: 0.0,
  };

  // Merge ui over engine defaults over DEF.
  return {
    spacing: u.spacing ?? e.spacing ?? DEF.spacing,
    jitter: u.jitter ?? e.jitter ?? DEF.jitter,
    scatter: u.scatter ?? e.scatter ?? DEF.scatter,
    count: Math.max(1, Math.round(u.count ?? e.count ?? DEF.count)),

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
    grainMotion: u.grainMotion ?? e.grainMotion ?? DEF.grainMotion,

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
  };
}

function normalizeOptions(opt: RenderOptions): RenderOptions {
  const engine = opt.engine ?? {};
  const overrides = mergeOverrides(engine.overrides, opt.overrides);
  const pixelRatio = resolveDpr(opt.pixelRatio);

  const width = Math.max(1, Math.floor(opt.width));
  const height = Math.max(1, Math.floor(opt.height));
  const baseSizePx = Math.max(1, opt.baseSizePx);

  return {
    ...opt,
    pixelRatio,
    width,
    height,
    baseSizePx,
    color: opt.color ?? "#000000",
    engine: {
      ...engine,
      overrides, // merged defaults + UI
    },
  };
}

/* ========================== Backend selection ======================= */

function pickBackend(opt: RenderOptions): Exclude<BrushBackend, "auto"> {
  const cfg = opt.engine ?? {};
  const ov = (cfg.overrides ?? {}) as Required<RenderOverrides>;
  const ui = opt.overrides ?? {};

  const chosen = cfg.backend ?? "auto";
  if (chosen !== "auto") return chosen;

  const isWet =
    Boolean(ui.wetEdges ?? cfg.rendering?.wetEdges ?? ov.wetEdges ?? false) ||
    cfg.rendering?.mode === "wet";

  const scatter = Math.max(
    ui.scatter ?? cfg.strokePath?.scatter ?? ov.scatter ?? 0,
    0
  );
  const count = Math.max(
    Math.round(ui.count ?? cfg.strokePath?.count ?? ov.count ?? 1),
    1
  );

  if (isWet) return "wet";
  if (scatter >= 12 || count >= 12) return "spray";
  // NOTE: keep pencils/charcoal in stamping unless presets pick otherwise.
  return "stamping";
}

/* ============================== Orchestrator ======================== */

export async function drawStrokeToCanvas(
  canvas: HTMLCanvasElement,
  opt: RenderOptions
): Promise<void> {
  // Normalize
  const nopt = normalizeOptions(opt);
  const backend = pickBackend(nopt);

  // Ensure bitmap size matches DPR
  const dpr = nopt.pixelRatio ?? 1;
  const targetW = Math.max(1, Math.floor(nopt.width * dpr));
  const targetH = Math.max(1, Math.floor(nopt.height * dpr));
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }
  if (canvas.style.width === "" || canvas.style.height === "") {
    canvas.style.width = `${nopt.width}px`;
    canvas.style.height = `${nopt.height}px`;
  }

  // Clear
  const ctx = canvas.getContext("2d", { alpha: true })!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, nopt.width, nopt.height);

  // Dispatch. Some backends expect canvas, others expect ctx.
  switch (backend) {
    case "ribbon":
      await drawRibbonToCanvas(canvas, nopt);
      break;
    case "spray":
      await drawSprayToCanvas(canvas, nopt);
      break;
    case "wet":
      await drawWetToCanvas(canvas, nopt);
      break;

    // ctx-based backends
    case "stamping":
      drawStamping(ctx, nopt);
      break;
    case "smudge":
      drawSmudge(ctx, nopt);
      break;
    case "particle":
      drawParticle(ctx, nopt);
      break;
    case "pattern":
      drawPattern(ctx, nopt);
      break;
    case "impasto":
      drawImpasto(ctx, nopt);
      break;

    default:
      // Fallback to stamping
      drawStamping(ctx, nopt);
      break;
  }
}

/** Back-compat alias */
export const renderBrushPreview = drawStrokeToCanvas;
export default drawStrokeToCanvas;
