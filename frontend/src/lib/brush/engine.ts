// src/lib/brush/engine.ts
/**
 * Brush engine orchestrator:
 * - Unifies types used by UI (BrushSettings) and presets
 * - Picks a backend: ribbon | stamping | spray | wet | auto
 * - Forwards RenderOptions unchanged to the selected backend
 */

import { drawRibbonToCanvas } from "./backends/ribbon";
import { drawStampingToCanvas } from "./backends/stamping";
import { drawSprayToCanvas } from "./backends/spray";
import { drawWetToCanvas } from "./backends/wet";

/* ============================== Types =============================== */

export type BrushBackend = "ribbon" | "stamping" | "spray" | "wet" | "auto";

/** Canonical rendering modes (no legacy names) */
export type RenderingMode = "blended" | "glazed" | "marker" | "spray" | "wet";

export type EngineShape = {
  /** Tip semantics; backends may ignore some fields */
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
  scale?: number; // 0.5..3 (bigger => finer look)
  rotate?: number; // deg
};

export type EngineRendering = {
  mode?: RenderingMode; // high-level intent; backends can ignore
  wetEdges?: boolean;
  flow?: number; // 0..100; high-level flow hint
};

export type RenderOverrides = {
  centerlinePencil?: boolean;

  // path placement (stamping/spray)
  spacing?: number; // %
  jitter?: number; // %
  scatter?: number; // px
  count?: number; // integer

  // tip & orientation
  angle?: number; // deg
  softness?: number; // 0..100

  // dynamics/feel
  flow?: number; // 0..100
  coreStrength?: number; // ribbon core intensity (60..300 OK)

  // grain
  grainKind?: "none" | "paper" | "canvas" | "noise";
  grainScale?: number; // 0.5..3
  grainDepth?: number; // 0..100
  grainRotate?: number; // deg

  // wet
  wetEdges?: boolean;
};

export type EngineConfig = {
  backend?: BrushBackend; // if omitted/auto, we pick via heuristics
  shape?: EngineShape;
  strokePath?: EngineStrokePath;
  grain?: EngineGrain;
  rendering?: EngineRendering;
  /** Engine-local defaults; UI may still override via RenderOptions.overrides */
  overrides?: Partial<RenderOverrides>;
};

/** Back-compat alias if other files still import this name */
export type BrushEngineConfig = EngineConfig;

export type RenderOptions = {
  engine: EngineConfig;
  baseSizePx: number; // diameter in CSS px (UI "size")
  color?: string;
  width: number; // CSS px
  height: number; // CSS px
  seed?: number;
  pixelRatio?: number;

  /** Optional path with angles & stylus signals */
  path?: Array<{
    x: number;
    y: number;
    angle?: number;
    pressure?: number;
    tilt?: number;
  }>;

  colorJitter?: { h?: number; s?: number; l?: number; perStamp?: boolean };
  overrides?: Partial<RenderOverrides>;
};

/* ========================== Backend selection ======================= */

function pickBackend(opt: RenderOptions): Exclude<BrushBackend, "auto"> {
  const cfg = opt.engine ?? {};
  const ov = cfg.overrides ?? {};
  const ui = opt.overrides ?? {};

  const chosen = cfg.backend ?? "auto";
  if (chosen !== "auto") return chosen;

  const wet = Boolean(
    (ui.wetEdges ?? cfg.rendering?.wetEdges ?? false) ||
      cfg.rendering?.mode === "wet"
  );

  const scatter = Math.max(ui.scatter ?? cfg.strokePath?.scatter ?? 0, 0);
  const count = Math.max(Math.round(ui.count ?? cfg.strokePath?.count ?? 1), 1);

  if (wet) return "wet";
  if (scatter >= 12 || count >= 12) return "spray";
  if (ui.centerlinePencil || ov.centerlinePencil) return "ribbon";
  return "stamping";
}

/* ============================== Orchestrator ======================== */

export async function drawStrokeToCanvas(
  canvas: HTMLCanvasElement,
  opt: RenderOptions
): Promise<void> {
  const backend = pickBackend(opt);
  switch (backend) {
    case "ribbon":
      await drawRibbonToCanvas(canvas, opt);
      break;
    case "spray":
      await drawSprayToCanvas(canvas, opt);
      break;
    case "wet":
      await drawWetToCanvas(canvas, opt);
      break;
    case "stamping":
    default:
      await drawStampingToCanvas(canvas, opt);
      break;
  }
}

/** Back-compat alias used elsewhere */
export const renderBrushPreview = drawStrokeToCanvas;
export default drawStrokeToCanvas;
