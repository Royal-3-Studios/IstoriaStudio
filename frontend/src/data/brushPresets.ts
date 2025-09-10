// src/data/brushPresets.ts

/* ============================
   Types
   ============================ */

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
  show?: boolean; // optional visibility hint for your settings UI
};

export type StrokePathCfg = {
  spacing: number; // px between stamps (UI)
  jitter: number; // 0..100 path jitter (UI)
  scatter: number; // 0..100 radial scatter per stamp (UI)
  streamline: number; // 0..100 (used by preview curve feel)
  count: number; // stamps per step (e.g. spray)
};

export type ShapeCfg = {
  type: "round" | "oval" | "chisel" | "square" | "spray" | "charcoal";
  angle?: number; // deg (for chisel/oval)
  softness?: number; // 0..100; affects alpha/edge
  roundness?: number; // 0..100; oval squish
  sizeScale?: number; // preview size multiplier
};

export type GrainKind = "none" | "paper" | "canvas" | "noise";

export type GrainCfg = {
  kind: GrainKind;
  depth: number; // 0..100 (UI)
  scale: number; // texture scale for preview/UI
};

export type RenderingMode =
  | "uniformGlaze"
  | "lightGlaze"
  | "heavyGlaze"
  | "wetMix"
  | "blended"
  | "intenseGlaze";

export type RenderingCfg = {
  mode: RenderingMode;
  wetEdges: boolean;
  flow: number; // 0..100 (UI)
};

// === NEW === Keep this in sync with RenderOptions["overrides"] used by the engine
export type BrushOverrides = Partial<{
  centerlinePencil: boolean;
  spacing: number; // fraction of radius (engine uses factor * baseRadius)
  jitter: number; // px
  scatter: number; // deg (not used by pencil)
  flow: number; // 0..100
  softness: number; // 0..100
  wetEdges: boolean;
  grainKind: GrainKind;
  grainScale: number; // 0.25..4
  grainDepth: number; // 0..100
  angle: number; // radians for stamp orientation bias
  count: number; // unused by pencil
  grainRotate: number; // degrees
  edgeHotness?: number;
  coreStrength?: number;
  disableEdgeTrough?: boolean;
}>;

export type BrushEngine = {
  strokePath: StrokePathCfg;
  shape: ShapeCfg;
  grain: GrainCfg;
  rendering: RenderingCfg;
  // Allow presets to carry through engine-level overrides into RenderOptions
  overrides?: BrushOverrides;
};

export type BrushPreset = {
  id: string;
  name: string;
  subtitle?: string;
  params: BrushParam[];
  engine: BrushEngine;
};

export type BrushCategory = {
  id: string;
  name: string;
  brushes: BrushPreset[];
};

/* ============================
   Helpers
   ============================ */

const p = (
  key: BrushParam["key"],
  label: string,
  type: BrushParamType,
  def: number,
  min = 0,
  max = 100,
  step = 1,
  show?: boolean
): BrushParam => ({
  key,
  label,
  type,
  defaultValue: def,
  min,
  max,
  step,
  ...(show === false ? { show } : {}),
});

/* Distinct engine “templates” so previews/cards look unique */
const engines = {
  technical: (): BrushEngine => ({
    strokePath: {
      spacing: 1.5,
      jitter: 2,
      scatter: 0,
      streamline: 80,
      count: 1,
    },
    shape: { type: "round", softness: 5, sizeScale: 1.0 },
    grain: { kind: "none", depth: 0, scale: 1.0 },
    rendering: { mode: "uniformGlaze", wetEdges: false, flow: 100 },
  }),
  calligraphy: (angle = 32): BrushEngine => ({
    strokePath: { spacing: 3, jitter: 3, scatter: 0, streamline: 70, count: 1 },
    shape: { type: "chisel", angle, softness: 10, sizeScale: 1.1 },
    grain: { kind: "none", depth: 0, scale: 1.0 },
    rendering: { mode: "uniformGlaze", wetEdges: false, flow: 90 },
  }),
  graphite: (): BrushEngine => ({
    strokePath: {
      spacing: 5,
      jitter: 12,
      scatter: 6,
      streamline: 35,
      count: 1,
    },
    shape: {
      type: "oval",
      angle: 14,
      softness: 40,
      roundness: 60,
      sizeScale: 1.0,
    },
    grain: { kind: "paper", depth: 40, scale: 1.2 },
    rendering: { mode: "lightGlaze", wetEdges: false, flow: 70 },
  }),
  charcoal: (): BrushEngine => ({
    strokePath: {
      spacing: 7,
      jitter: 24,
      scatter: 12,
      streamline: 20,
      count: 1,
    },
    shape: { type: "charcoal", softness: 55, sizeScale: 1.1 },
    grain: { kind: "noise", depth: 60, scale: 1.3 },
    rendering: { mode: "lightGlaze", wetEdges: false, flow: 85 },
  }),
  spray: (): BrushEngine => ({
    strokePath: {
      spacing: 9,
      jitter: 8,
      scatter: 30,
      streamline: 15,
      count: 10,
    },
    shape: { type: "spray", softness: 40, sizeScale: 1.0 },
    grain: { kind: "none", depth: 0, scale: 1.0 },
    rendering: { mode: "blended", wetEdges: false, flow: 55 },
  }),
  watercolor: (): BrushEngine => ({
    strokePath: {
      spacing: 6,
      jitter: 10,
      scatter: 8,
      streamline: 35,
      count: 1,
    },
    shape: { type: "round", softness: 70, sizeScale: 1.2 },
    grain: { kind: "paper", depth: 35, scale: 1.1 },
    rendering: { mode: "wetMix", wetEdges: true, flow: 60 },
  }),
  oil: (): BrushEngine => ({
    strokePath: { spacing: 6, jitter: 8, scatter: 6, streamline: 30, count: 1 },
    shape: {
      type: "oval",
      angle: 0,
      softness: 30,
      roundness: 40,
      sizeScale: 1.3,
    },
    grain: { kind: "canvas", depth: 55, scale: 1.0 },
    rendering: { mode: "heavyGlaze", wetEdges: false, flow: 75 },
  }),
  glow: (): BrushEngine => ({
    strokePath: { spacing: 2, jitter: 2, scatter: 0, streamline: 75, count: 1 },
    shape: { type: "round", softness: 20, sizeScale: 0.8 },
    grain: { kind: "none", depth: 0, scale: 1.0 },
    rendering: { mode: "uniformGlaze", wetEdges: false, flow: 90 },
  }),
  membrane: (): BrushEngine => ({
    strokePath: {
      spacing: 8,
      jitter: 18,
      scatter: 10,
      streamline: 25,
      count: 1,
    },
    shape: {
      type: "oval",
      angle: 22,
      softness: 35,
      roundness: 30,
      sizeScale: 1.0,
    },
    grain: { kind: "noise", depth: 50, scale: 1.2 },
    rendering: { mode: "blended", wetEdges: false, flow: 70 },
  }),
};

/* ============================
   Library Catalog
   ============================ */

export const BRUSH_CATEGORIES: BrushCategory[] = [
  /* ---------- Sketching ---------- */
  {
    id: "sketching",
    name: "Sketching",
    brushes: [
      {
        id: "pencil-2h",
        name: "Pencil 2H",
        subtitle: "tight lines",
        params: [
          p("size", "Size", "size", 4, 1, 50, 1, true),
          p("hardness", "Hardness", "hardness", 90),
          p("flow", "Flow", "flow", 70),
          p("spacing", "Spacing", "spacing", 12),
          p("smoothing", "Smoothing", "smoothing", 20),
          p("jitterSize", "Size Jitter", "jitterSize", 5, 0, 100, 1, false),
        ],
        engine: engines.graphite(),
      },
      {
        id: "pencil-b",
        name: "Pencil B",
        subtitle: "soft shading",
        params: [
          p("size", "Size", "size", 12, 1, 80, 1, true),
          p("hardness", "Hardness", "hardness", 60),
          p("flow", "Flow", "flow", 85),
          p("spacing", "Spacing", "spacing", 14),
          p("smoothing", "Smoothing", "smoothing", 18),
          p("grain", "Grain", "grain", 25),
        ],
        engine: engines.graphite(),
      },
      {
        id: "charcoal",
        name: "Charcoal",
        subtitle: "grainy edge",
        params: [
          p("size", "Size", "size", 18, 1, 120, 1, true),
          p("hardness", "Hardness", "hardness", 35),
          p("flow", "Flow", "flow", 90),
          p("spacing", "Spacing", "spacing", 18),
          p("jitterSize", "Size Jitter", "jitterSize", 30),
          p("grain", "Grain", "grain", 60),
        ],
        engine: engines.charcoal(),
      },
      {
        id: "pencil-6b",
        name: "Pencil 6B",
        subtitle: "soft, dark graphite",
        params: [
          p("size", "Size", "size", 8, 1, 80, 1, true),
          p("flow", "Flow", "flow", 100),
          p("smoothing", "Smoothing", "smoothing", 22),
          p("grain", "Grain", "grain", 52),
          p("opacity", "Opacity", "opacity", 100),
        ],
        engine: {
          strokePath: {
            spacing: 4,
            jitter: 0.5,
            scatter: 0,
            streamline: 30,
            count: 1,
          },
          shape: {
            type: "oval",
            angle: 8,
            softness: 50,
            roundness: 28,
            sizeScale: 1.0,
          },
          grain: { kind: "paper", depth: 56, scale: 1.15 },
          rendering: { mode: "blended", wetEdges: false, flow: 100 },
          overrides: {
            centerlinePencil: true,
            // spacing/jitter are ignored by the ribbon engine
            flow: 100,
            grainKind: "paper",
            grainScale: 1.35,
            grainDepth: 66,
            grainRotate: 8,
            angle: 0,
            coreStrength: 300,
          },
        },
      },
    ],
  },

  /* ---------- Inking ---------- */
  {
    id: "inking",
    name: "Inking",
    brushes: [
      {
        id: "technical-pen",
        name: "Technical Pen",
        subtitle: "crisp",
        params: [
          p("size", "Size", "size", 6, 1, 40),
          p("hardness", "Hardness", "hardness", 100),
          p("flow", "Flow", "flow", 100),
          p("spacing", "Spacing", "spacing", 6),
          p("smoothing", "Smoothing", "smoothing", 35),
        ],
        engine: engines.technical(),
      },
      {
        id: "calligraphy",
        name: "Calligraphy",
        subtitle: "angle nib",
        params: [
          p("size", "Size", "size", 16, 1, 80),
          p("flow", "Flow", "flow", 95),
          p("spacing", "Spacing", "spacing", 10),
          p("smoothing", "Smoothing", "smoothing", 20),
          p("angle", "Angle", "angle", 32, 0, 360),
        ],
        engine: engines.calligraphy(32),
      },
    ],
  },

  /* ---------- Painting ---------- */
  {
    id: "painting",
    name: "Painting",
    brushes: [
      {
        id: "round-brush",
        name: "Round Brush",
        subtitle: "general purpose",
        params: [
          p("size", "Size", "size", 24, 1, 120, 1, true),
          p("hardness", "Hardness", "hardness", 65),
          p("flow", "Flow", "flow", 75),
          p("spacing", "Spacing", "spacing", 20),
          p("smoothing", "Smoothing", "smoothing", 15),
        ],
        engine: engines.watercolor(), // softer edge feel for preview
      },
      {
        id: "watercolor",
        name: "Watercolor",
        subtitle: "wet edge",
        params: [
          p("size", "Size", "size", 22),
          p("flow", "Flow", "flow", 55),
          p("spacing", "Spacing", "spacing", 28),
          p("opacity", "Opacity", "opacity", 70),
        ],
        engine: engines.watercolor(),
      },
      {
        id: "oil-brush",
        name: "Oil Brush",
        subtitle: "bristles",
        params: [
          p("size", "Size", "size", 28),
          p("flow", "Flow", "flow", 65),
          p("spacing", "Spacing", "spacing", 24),
          p("grain", "Grain", "grain", 45),
        ],
        engine: engines.oil(),
      },
    ],
  },

  /* ---------- Airbrushing ---------- */
  {
    id: "airbrushing",
    name: "Airbrushing",
    brushes: [
      {
        id: "soft-air",
        name: "Soft Air",
        subtitle: "gentle",
        params: [
          p("size", "Size", "size", 36),
          p("flow", "Flow", "flow", 35),
          p("spacing", "Spacing", "spacing", 35),
          p("opacity", "Opacity", "opacity", 50),
        ],
        engine: engines.spray(), // uses spray dots in preview for uniqueness
      },
      {
        id: "hard-air",
        name: "Hard Air",
        subtitle: "edges",
        params: [
          p("size", "Size", "size", 28),
          p("flow", "Flow", "flow", 55),
          p("spacing", "Spacing", "spacing", 22),
          p("opacity", "Opacity", "opacity", 80),
        ],
        engine: engines.technical(),
      },
      {
        id: "spray-nozzle",
        name: "Spray Nozzle",
        subtitle: "speckled",
        params: [p("size", "Size", "size", 26), p("flow", "Flow", "flow", 55)],
        engine: engines.spray(),
      },
    ],
  },

  /* ---------- Textures ---------- */
  {
    id: "textures",
    name: "Textures",
    brushes: [
      {
        id: "paper-grain",
        name: "Paper Grain",
        subtitle: "toothy",
        params: [
          p("size", "Size", "size", 20),
          p("spacing", "Spacing", "spacing", 26),
          p("grain", "Grain", "grain", 70),
          p("jitterSize", "Size Jitter", "jitterSize", 22),
        ],
        engine: engines.graphite(),
      },
      {
        id: "canvas",
        name: "Canvas",
        subtitle: "weave",
        params: [
          p("size", "Size", "size", 26),
          p("spacing", "Spacing", "spacing", 22),
          p("grain", "Grain", "grain", 80),
          p("jitterAngle", "Angle Jitter", "jitterAngle", 18),
        ],
        engine: engines.oil(),
      },
    ],
  },

  /* ---------- Abstract ---------- */
  {
    id: "abstract",
    name: "Abstract",
    brushes: [
      {
        id: "storm-bay",
        name: "Storm Bay",
        subtitle: "chaotic",
        params: [p("size", "Size", "size", 24, 1, 120)],
        engine: engines.spray(),
      },
      {
        id: "waveform",
        name: "Waveform",
        subtitle: "oscillate",
        params: [
          p("size", "Size", "size", 18),
          p("flow", "Flow", "flow", 65),
          p("spacing", "Spacing", "spacing", 12),
          p("jitterSize", "Size Jitter", "jitterSize", 25),
          p("opacity", "Opacity", "opacity", 80),
        ],
        engine: engines.graphite(),
      },
      {
        id: "membrane",
        name: "Membrane",
        subtitle: "organic",
        params: [
          p("size", "Size", "size", 20),
          p("flow", "Flow", "flow", 70),
          p("spacing", "Spacing", "spacing", 16),
          p("jitterAngle", "Angle Jitter", "jitterAngle", 25),
          p("grain", "Grain", "grain", 50),
        ],
        engine: engines.membrane(),
      },
    ],
  },

  /* ---------- Materials / Luminance ---------- */
  {
    id: "materials",
    name: "Materials",
    brushes: [
      {
        id: "metal-scrape",
        name: "Metal Scrape",
        subtitle: "rough",
        params: [
          p("size", "Size", "size", 22),
          p("spacing", "Spacing", "spacing", 30),
          p("grain", "Grain", "grain", 85),
          p("jitterSize", "Size Jitter", "jitterSize", 35),
        ],
        engine: engines.charcoal(),
      },
      {
        id: "stone-dust",
        name: "Stone Dust",
        subtitle: "speckle",
        params: [
          p("size", "Size", "size", 18),
          p("spacing", "Spacing", "spacing", 26),
          p("grain", "Grain", "grain", 75),
          p("opacity", "Opacity", "opacity", 70),
        ],
        engine: engines.charcoal(),
      },
    ],
  },
  {
    id: "luminance",
    name: "Luminance",
    brushes: [
      {
        id: "glow-soft",
        name: "Glow Soft",
        subtitle: "bloom",
        params: [
          p("size", "Size", "size", 30),
          p("flow", "Flow", "flow", 40),
          p("opacity", "Opacity", "opacity", 65),
          p("smoothing", "Smoothing", "smoothing", 14),
        ],
        engine: engines.glow(),
      },
      {
        id: "glow-line",
        name: "Glow Line",
        subtitle: "neon",
        params: [
          p("size", "Size", "size", 10),
          p("flow", "Flow", "flow", 80),
          p("opacity", "Opacity", "opacity", 90),
          p("smoothing", "Smoothing", "smoothing", 20),
        ],
        engine: engines.glow(),
      },
    ],
  },
];

/* Lookup by id */
export const BRUSH_BY_ID = Object.fromEntries(
  BRUSH_CATEGORIES.flatMap((c) => c.brushes.map((b) => [b.id, b]))
) as Record<string, BrushPreset>;
