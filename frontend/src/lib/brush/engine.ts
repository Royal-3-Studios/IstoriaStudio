// src/lib/brush/engine.ts
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

// ctx-based backends (yours/new)
import drawStamping from "./backends/stamping";
import drawSmudge from "./backends/smudge";
import drawParticle from "./backends/particle";
import drawPattern from "./backends/pattern";
import drawImpasto from "./backends/impasto";

/* ============================== Types =============================== */

export type BrushBackend =
  | "ribbon"
  | "stamping"
  | "spray"
  | "wet"
  | "smudge"
  | "particle"
  | "pattern"
  | "impasto"
  | "auto";

/** Canonical rendering modes (no legacy names) */
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

export type RenderOverrides = {
  centerlinePencil?: boolean;

  // placement
  spacing?: number; // %
  jitter?: number; // %
  scatter?: number; // px
  count?: number; // integer

  // tip/orientation
  angle?: number; // deg
  softness?: number; // 0..100

  // dynamics
  flow?: number; // 0..100
  coreStrength?: number; // ribbon intensity

  // grain
  grainKind?: "none" | "paper" | "canvas" | "noise";
  grainScale?: number; // 0.5..3
  grainDepth?: number; // 0..100
  grainRotate?: number; // deg

  // wet
  wetEdges?: boolean;

  // NEW — pencil/stamping rim control
  rimMode?: "auto" | "on" | "off"; // default "auto"
  rimStrength?: number; // 0..1, default 0.18
  bgIsLight?: boolean; // hint for auto; default true
};

export type EngineConfig = {
  backend?: BrushBackend; // if "auto", we pick via heuristics
  shape?: EngineShape;
  strokePath?: EngineStrokePath;
  grain?: EngineGrain;
  rendering?: EngineRendering;
  overrides?: Partial<RenderOverrides>; // engine defaults
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

  const DEF = {
    spacing: 4,
    jitter: 0.5,
    scatter: 0,
    count: 1,
    angle: 0,
    softness: 50,
    flow: 100,
    coreStrength: 140,
    grainKind: "none" as "none" | "paper" | "canvas" | "noise",
    grainScale: 1.0,
    grainDepth: 0,
    grainRotate: 0,
    wetEdges: false,
    centerlinePencil: false,
    rimMode: "auto" as "auto" | "on" | "off",
    rimStrength: 0.18,
    bgIsLight: true,
  };

  return {
    centerlinePencil:
      u.centerlinePencil ?? e.centerlinePencil ?? DEF.centerlinePencil,
    spacing: (u.spacing ?? e.spacing ?? DEF.spacing) as number,
    jitter: (u.jitter ?? e.jitter ?? DEF.jitter) as number,
    scatter: (u.scatter ?? e.scatter ?? DEF.scatter) as number,
    count: Math.max(1, Math.round(u.count ?? e.count ?? DEF.count)) as number,
    angle: (u.angle ?? e.angle ?? DEF.angle) as number,
    softness: (u.softness ?? e.softness ?? DEF.softness) as number,
    flow: (u.flow ?? e.flow ?? DEF.flow) as number,
    coreStrength: (u.coreStrength ??
      e.coreStrength ??
      DEF.coreStrength) as number,
    grainKind: (u.grainKind ?? e.grainKind ?? DEF.grainKind) as
      | "none"
      | "paper"
      | "canvas"
      | "noise",
    grainScale: (u.grainScale ?? e.grainScale ?? DEF.grainScale) as number,
    grainDepth: (u.grainDepth ?? e.grainDepth ?? DEF.grainDepth) as number,
    grainRotate: (u.grainRotate ?? e.grainRotate ?? DEF.grainRotate) as number,
    wetEdges: u.wetEdges ?? e.wetEdges ?? DEF.wetEdges,
    rimMode: (u.rimMode ?? e.rimMode ?? DEF.rimMode) as "auto" | "on" | "off",
    rimStrength: (u.rimStrength ?? e.rimStrength ?? DEF.rimStrength) as number,
    bgIsLight: (u.bgIsLight ?? e.bgIsLight ?? DEF.bgIsLight) as boolean,
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
  // NOTE: don't force ribbon on centerlinePencil. Let presets pick stamping for pencils.
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
