// FILE: src/data/brushPresets.ts

import type { EngineConfig } from "@/lib/brush/engine";

/* ============================
   UI Param Types
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
  show?: boolean;
};

export type BrushPreset = {
  id: string;
  name: string;
  subtitle?: string;
  params: BrushParam[];
  engine: EngineConfig;
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

/* ============================
   Engine templates
   (canonical, single-backend)
   ============================ */

const engines = {
  technical: (): EngineConfig => ({
    backend: "ribbon",
    strokePath: { spacing: 0, jitter: 0, scatter: 0, streamline: 80, count: 1 },
    shape: { type: "nib", softness: 0, roundness: 100, sizeScale: 1.0 },
    grain: { kind: "none", depth: 0, scale: 1.0 },
    rendering: { mode: "marker", wetEdges: false, flow: 100 },
    overrides: {
      // crisp, uniform ink
      uniformity: 0.92,
      tipScaleStart: 0.15,
      tipScaleEnd: 0.2,
      tipMinPx: 0.6,
      rimMode: "off",
      toothBody: 0,
      toothFlank: 0,
      coreStrength: 160, // ribbon intensity
      speedToWidth: 0,
      speedToFlow: 0,
    },
  }),

  calligraphy: (angle = 32): EngineConfig => ({
    backend: "ribbon",
    strokePath: { spacing: 0, jitter: 0, scatter: 0, streamline: 70, count: 1 },
    shape: { type: "chisel", angle, softness: 6, sizeScale: 1.0 },
    grain: { kind: "none", depth: 0, scale: 1.0 },
    rendering: { mode: "marker", wetEdges: false, flow: 100 },
    overrides: {
      uniformity: 0.9,
      tipScaleStart: 0.1,
      tipScaleEnd: 0.15,
      tipMinPx: 0.8,
      rimMode: "off",
      toothBody: 0,
      toothFlank: 0,
      coreStrength: 160,
      speedToWidth: 0,
      speedToFlow: 0,
    },
  }),

  graphite: (): EngineConfig => ({
    backend: "ribbon",
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
    rendering: { mode: "glazed", wetEdges: false, flow: 70 },
    overrides: { centerlinePencil: true },
  }),

  charcoal: (): EngineConfig => ({
    backend: "stamping",
    strokePath: {
      spacing: 7,
      jitter: 24,
      scatter: 12,
      streamline: 20,
      count: 1,
    },
    shape: { type: "charcoal", softness: 55, sizeScale: 1.1 },
    grain: { kind: "noise", depth: 60, scale: 1.3 },
    rendering: { mode: "glazed", wetEdges: false, flow: 85 },
  }),

  spray: (): EngineConfig => ({
    backend: "spray",
    strokePath: {
      spacing: 9,
      jitter: 8,
      scatter: 30,
      streamline: 15,
      count: 10,
    },
    shape: { type: "spray", softness: 40, sizeScale: 1.0 },
    grain: { kind: "none", depth: 0, scale: 1.0 },
    rendering: { mode: "spray", wetEdges: false, flow: 55 },
  }),

  watercolor: (): EngineConfig => ({
    backend: "wet",
    strokePath: {
      spacing: 6,
      jitter: 10,
      scatter: 8,
      streamline: 35,
      count: 1,
    },
    shape: { type: "round", softness: 70, sizeScale: 1.2 },
    grain: { kind: "paper", depth: 35, scale: 1.1 },
    rendering: { mode: "wet", wetEdges: true, flow: 60 },
  }),

  oil: (): EngineConfig => ({
    backend: "stamping",
    strokePath: { spacing: 6, jitter: 8, scatter: 6, streamline: 30, count: 1 },
    shape: {
      type: "oval",
      angle: 0,
      softness: 30,
      roundness: 40,
      sizeScale: 1.3,
    },
    grain: { kind: "canvas", depth: 55, scale: 1.0 },
    rendering: { mode: "blended", wetEdges: false, flow: 75 },
  }),

  glow: (): EngineConfig => ({
    backend: "stamping",
    strokePath: { spacing: 2, jitter: 2, scatter: 0, streamline: 75, count: 1 },
    shape: { type: "round", softness: 20, sizeScale: 0.8 },
    grain: { kind: "none", depth: 0, scale: 1.0 },
    rendering: { mode: "glazed", wetEdges: false, flow: 90 },
  }),

  membrane: (): EngineConfig => ({
    backend: "stamping",
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

  /* New: impasto/particle/pattern templates so every backend is covered */

  impasto: (): EngineConfig => ({
    backend: "impasto",
    strokePath: { spacing: 7, jitter: 6, scatter: 4, streamline: 25, count: 1 },
    shape: { type: "oval", softness: 20, roundness: 30, sizeScale: 1.2 },
    grain: { kind: "canvas", depth: 65, scale: 1.0, rotate: 0 },
    rendering: { mode: "blended", wetEdges: false, flow: 80 },
    overrides: {
      // Keep edges a touch softer; let impasto backend do the body
      tipScaleStart: 0.3,
      tipScaleEnd: 0.35,
      uniformity: 0.18,
    },
  }),

  particle: (): EngineConfig => ({
    backend: "particle",
    strokePath: {
      spacing: 8,
      jitter: 16,
      scatter: 22,
      streamline: 18,
      count: 1,
    },
    shape: { type: "spray", softness: 45, sizeScale: 1.0 },
    grain: { kind: "none", depth: 0, scale: 1.0 },
    rendering: { mode: "spray", wetEdges: false, flow: 60 },
  }),

  pattern: (): EngineConfig => ({
    backend: "pattern",
    strokePath: { spacing: 6, jitter: 6, scatter: 0, streamline: 40, count: 1 },
    shape: { type: "square", softness: 10, sizeScale: 1.0 },
    grain: { kind: "none", depth: 0, scale: 1.0 },
    rendering: { mode: "marker", wetEdges: false, flow: 100 },
  }),

  ribbonPen: (opts?: {
    taper?: number; // 0..1
    flow?: number; // 0..100
    smoothing?: number; // 0..100 (UI hint)
    uniformity?: number; // 0..1
  }): EngineConfig => ({
    backend: "ribbon",
    strokePath: {
      spacing: 4,
      jitter: 0,
      scatter: 0,
      streamline: opts?.smoothing ?? 32,
      count: 1,
    },
    shape: { type: "nib", softness: 100, sizeScale: 1.0 },
    grain: { kind: "none", depth: 0, scale: 1.0 },
    rendering: { mode: "marker", wetEdges: false, flow: opts?.flow ?? 100 },
    overrides: {
      tipScaleStart: opts?.taper ?? 0.92,
      tipScaleEnd: opts?.taper ?? 0.92,
      tipMinPx: 0.7,
      uniformity: opts?.uniformity ?? 0.9,
      bellyGain: 1.0,
      speedSmoothingMs: 18,
      speedToWidth: 0.06, // tiny swell at speed (keeps it “technical”)
      speedToFlow: 0.0,
      rimMode: "off",
      toothBody: 0,
      toothFlank: 0,
      grainKind: "none",
    },
  }),

  /** Ribbon chisel (angled nib, crisp). */
  ribbonChisel: (
    angle = 32,
    opts?: {
      flow?: number;
      smoothing?: number;
      taper?: number;
      uniformity?: number;
    }
  ): EngineConfig => ({
    backend: "ribbon",
    strokePath: {
      spacing: 4,
      jitter: 0,
      scatter: 0,
      streamline: opts?.smoothing ?? 26,
      count: 1,
    },
    shape: { type: "chisel", angle, softness: 100, sizeScale: 1.0 },
    grain: { kind: "none", depth: 0, scale: 1 },
    rendering: { mode: "marker", wetEdges: false, flow: opts?.flow ?? 100 },
    overrides: {
      tipScaleStart: opts?.taper ?? 0.9,
      tipScaleEnd: opts?.taper ?? 0.9,
      tipMinPx: 0.7,
      uniformity: opts?.uniformity ?? 0.85,
      bellyGain: 1.0,
      rimMode: "off",
      toothBody: 0,
      toothFlank: 0,
      grainKind: "none",
    },
  }),

  /**
   * Textured ink (stamping) — darker, smoother, barely any tooth.
   * Keeps ink vibe without graphite speckle.
   */
  inkStamped: (opts?: {
    flow?: number;
    smoothing?: number;
    spacingPct?: number;
    toothBody?: number;
    toothFlank?: number;
    toothScale?: number;
    softness?: number;
  }): EngineConfig => ({
    backend: "stamping",
    strokePath: {
      spacing: opts?.spacingPct ?? 2.6, // tighter for smoothness
      jitter: 1.5,
      scatter: 0,
      streamline: opts?.smoothing ?? 30,
      count: 1,
    },
    shape: { type: "round", softness: opts?.softness ?? 12, sizeScale: 1.0 },
    grain: { kind: "none", depth: 0, scale: 1 },
    rendering: { mode: "glazed", wetEdges: false, flow: opts?.flow ?? 100 },
    overrides: {
      // near-ink: barely-there tooth so it doesn’t gray out
      toothBody: opts?.toothBody ?? 0.06,
      toothFlank: opts?.toothFlank ?? 0.1,
      toothScale: opts?.toothScale ?? 0,
      rimMode: "off",
      // crisper center line & less chalkiness
      uniformity: 0.78,
      tipScaleStart: 0.92,
      tipScaleEnd: 0.92,
      tipMinPx: 0.7,
      bellyGain: 1.02,
      edgeNoiseStrength: 0, // no dry fringe for ink
    },
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
        ],
        engine: {
          backend: "stamping",
          strokePath: {
            spacing: 3,
            jitter: 2,
            scatter: 0,
            streamline: 35,
            count: 1,
          },
          shape: {
            type: "oval",
            angle: 6,
            softness: 38,
            roundness: 70,
            sizeScale: 1.0,
          },
          grain: { kind: "paper", depth: 42, scale: 1.15 },
          rendering: { mode: "glazed", wetEdges: false, flow: 78 },
          overrides: {
            flow: 72,
            rimMode: "auto",
            rimStrength: 0.12,
            bgIsLight: true,
            toothBody: 0.72,
            toothFlank: 0.55,
            toothScale: 24,
            tipScaleStart: 0.5,
            tipScaleEnd: 0.55,
            tipMinPx: 0.9,
            uniformity: 0.15,
            bellyGain: 0.95,
            endBias: 0.0,
          },
        },
      },

      // 4B — peppery flank, decent fill in the belly
      {
        id: "pencil-4b",
        name: "4B Pencil",
        subtitle: "slim belly, crisp edge",
        params: [
          p("size", "Size", "size", 7, 1, 80, 1, true),
          p("flow", "Flow", "flow", 90),
          p("smoothing", "Smoothing", "smoothing", 22),
          p("grain", "Grain", "grain", 52),
        ],
        engine: {
          backend: "stamping",
          strokePath: {
            spacing: 3,
            jitter: 4,
            scatter: 0,
            streamline: 30,
            count: 1,
          },
          shape: {
            type: "oval",
            angle: 8,
            softness: 48,
            roundness: 40,
            sizeScale: 1.0,
          },
          grain: { kind: "paper", depth: 60, scale: 1.15 },
          rendering: { mode: "glazed", wetEdges: false, flow: 100 },
          overrides: {
            flow: 70,
            rimMode: "auto",
            rimStrength: 0.11,
            bgIsLight: true,
            toothBody: 0.58,
            toothFlank: 0.92,
            toothScale: 0,
            tipScaleStart: 0.55,
            tipScaleEnd: 0.6,
            tipMinPx: 0.8,
            uniformity: 0.1,
            bellyGain: 1.0,
            endBias: 0.05,
          },
        },
      },

      // 6B — smoother core (fewer belly holes), textured shoulders
      {
        id: "pencil-6b",
        name: "6B Pencil",
        subtitle: "long reach, lively core",
        params: [
          p("size", "Size", "size", 8, 1, 80, 1, true),
          p("flow", "Flow", "flow", 100),
          p("smoothing", "Smoothing", "smoothing", 22),
          p("grain", "Grain", "grain", 52),
        ],
        engine: {
          backend: "stamping",
          strokePath: {
            spacing: 3,
            jitter: 3,
            scatter: 0,
            streamline: 28,
            count: 1,
          },
          shape: {
            type: "oval",
            angle: 8,
            softness: 50,
            roundness: 28,
            sizeScale: 1.0,
          },
          grain: { kind: "paper", depth: 68, scale: 1.15 },
          rendering: { mode: "glazed", wetEdges: false, flow: 100 },
          overrides: {
            flow: 64,
            rimMode: "auto",
            rimStrength: 0.1,
            bgIsLight: true,
            toothBody: 0.62,
            toothFlank: 0.96,
            toothScale: 32,
            tipScaleStart: 0.6,
            tipScaleEnd: 0.65,
            tipMinPx: 0.8,
            uniformity: 0.08,
            bellyGain: 1.05,
            endBias: 0.05,
          },
        },
      },

      // 9B — smoothest core (fewest belly holes)
      {
        id: "pencil-9b",
        name: "9B Pencil",
        subtitle: "dark belly, soft shoulder",
        params: [
          p("size", "Size", "size", 9, 1, 80, 1, true),
          p("flow", "Flow", "flow", 100),
          p("smoothing", "Smoothing", "smoothing", 22),
          p("grain", "Grain", "grain", 52),
        ],
        engine: {
          backend: "stamping",
          strokePath: {
            spacing: 3.2,
            jitter: 2,
            scatter: 0,
            streamline: 26,
            count: 1,
          },
          shape: {
            type: "oval",
            angle: 8,
            softness: 54,
            roundness: 24,
            sizeScale: 1.0,
          },
          grain: { kind: "paper", depth: 72, scale: 1.15 },
          rendering: { mode: "glazed", wetEdges: false, flow: 100 },
          overrides: {
            flow: 62,
            rimMode: "auto",
            rimStrength: 0.1,
            bgIsLight: true,
            toothBody: 0.3,
            toothFlank: 0.8,
            toothScale: 0,
            tipScaleStart: 0.62,
            tipScaleEnd: 0.7,
            tipMinPx: 0.8,
            uniformity: 0.05,
            bellyGain: 1.1,
            endBias: 0.04,
          },
        },
      },

      {
        id: "pc-hb-pencil",
        name: "HB Pencil",
        subtitle: "thin, crisp",
        params: [
          p("size", "Size", "size", 6, 1, 60, 1, true),
          p("flow", "Flow", "flow", 80),
          p("smoothing", "Smoothing", "smoothing", 42),
          p("grain", "Grain", "grain", 40),
        ],
        engine: {
          backend: "stamping",
          strokePath: {
            spacing: 2.5,
            jitter: 2,
            scatter: 0,
            streamline: 42,
            count: 1,
          },
          shape: {
            type: "oval",
            angle: 8,
            softness: 46,
            roundness: 34,
            sizeScale: 1.0,
          },
          grain: { kind: "paper", depth: 40, scale: 1.05 },
          rendering: { mode: "glazed", wetEdges: false, flow: 95 },
          overrides: {
            flow: 56,
            rimMode: "auto",
            rimStrength: 0.16,
            bgIsLight: true,
          },
        },
      },
      {
        id: "pc-charcoal-pencil",
        name: "Charcoal Pencil",
        subtitle: "pencil line, extra tooth",
        params: [
          p("size", "Size", "size", 10, 1, 100, 1, true),
          p("flow", "Flow", "flow", 95),
          p("smoothing", "Smoothing", "smoothing", 24),
          p("grain", "Grain", "grain", 68),
        ],
        engine: {
          backend: "stamping",
          strokePath: {
            spacing: 3.2,
            jitter: 8,
            scatter: 0.4,
            streamline: 24,
            count: 1,
          },
          shape: {
            type: "oval",
            angle: 6,
            softness: 50,
            roundness: 32,
            sizeScale: 1.0,
          },
          grain: { kind: "noise", depth: 70, scale: 1.25 },
          rendering: { mode: "glazed", wetEdges: false, flow: 100 },
          overrides: { flow: 64, rimMode: "off", rimStrength: 0.0 },
        },
      },

      {
        id: "pc-charcoal-pencil-2",
        name: "Charcoal Pencil 2",
        subtitle: "slimmer pencil w/ tooth",
        params: [
          p("size", "Size", "size", 9, 1, 80, 1, true),
          p("flow", "Flow", "flow", 90),
          p("smoothing", "Smoothing", "smoothing", 30),
          p("grain", "Grain", "grain", 62),
        ],
        engine: {
          backend: "stamping",
          strokePath: {
            spacing: 3.0,
            jitter: 5,
            scatter: 0.2,
            streamline: 30,
            count: 1,
          },
          shape: {
            type: "oval",
            angle: 6,
            softness: 50,
            roundness: 32,
            sizeScale: 1.0,
          },
          grain: { kind: "noise", depth: 62, scale: 1.2 },
          rendering: { mode: "glazed", wetEdges: false, flow: 100 },
          overrides: { flow: 61, rimMode: "off", rimStrength: 0.0 },
        },
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
    ],
  },

  /* ---------- Dry Media (Graphite · Charcoal · Conté) ---------- */
  {
    id: "dry-media",
    name: "Dry Media (Graphite · Charcoal · Conté)",
    brushes: [
      {
        id: "pc-charcoal-light-grainy",
        name: "Charcoal Light Grainy",
        subtitle: "dry, peppery edge",
        params: [
          p("size", "Size", "size", 14, 1, 120, 1, true),
          p("flow", "Flow", "flow", 90),
          p("smoothing", "Smoothing", "smoothing", 20),
          p("grain", "Grain", "grain", 72),
        ],
        engine: {
          backend: "stamping",
          strokePath: {
            spacing: 3.4,
            jitter: 4,
            scatter: 0,
            streamline: 20,
            count: 1,
          },
          shape: { type: "charcoal", softness: 55, sizeScale: 1.05 },
          grain: { kind: "noise", depth: 78, scale: 1.35 },
          rendering: { mode: "glazed", wetEdges: false, flow: 95 },
        },
      },
      {
        id: "pc-charcoal-light-smudged",
        name: "Charcoal Light Smudged",
        subtitle: "rubbed halo",
        params: [
          p("size", "Size", "size", 16, 1, 120, 1, true),
          p("flow", "Flow", "flow", 75),
          p("smoothing", "Smoothing", "smoothing", 25),
          p("grain", "Grain", "grain", 40),
        ],
        engine: {
          backend: "smudge",
          strokePath: {
            spacing: 3.6,
            jitter: 6,
            scatter: 2,
            streamline: 25,
            count: 1,
          },
          shape: { type: "round", softness: 70, sizeScale: 1.0 },
          grain: { kind: "paper", depth: 30, scale: 1.1 },
          rendering: { mode: "blended", wetEdges: false, flow: 70 },
        },
      },

      {
        id: "pc-charcoal-smooth",
        name: "Charcoal Smooth",
        subtitle: "wide, velvety",
        params: [
          p("size", "Size", "size", 22, 1, 140, 1, true),
          p("flow", "Flow", "flow", 70),
          p("smoothing", "Smoothing", "smoothing", 20),
          p("grain", "Grain", "grain", 30),
        ],
        engine: {
          backend: "smudge",
          strokePath: {
            spacing: 3.8,
            jitter: 8,
            scatter: 3,
            streamline: 20,
            count: 1,
          },
          shape: { type: "round", softness: 80, sizeScale: 1.15 },
          grain: { kind: "paper", depth: 25, scale: 1.15 },
          rendering: { mode: "blended", wetEdges: false, flow: 65 },
        },
      },
      {
        id: "pc-charcoal-stick",
        name: "Charcoal Stick",
        subtitle: "blocky, bar nib",
        params: [
          p("size", "Size", "size", 18, 1, 120, 1, true),
          p("flow", "Flow", "flow", 90),
          p("smoothing", "Smoothing", "smoothing", 22),
          p("grain", "Grain", "grain", 55),
          p("angle", "Angle", "angle", 0, 0, 360),
        ],
        engine: {
          backend: "stamping",
          strokePath: {
            spacing: 3.0,
            jitter: 2,
            scatter: 0,
            streamline: 22,
            count: 1,
          },
          shape: { type: "chisel", angle: 0, softness: 22, sizeScale: 1.1 },
          grain: { kind: "noise", depth: 60, scale: 1.2 },
          rendering: { mode: "glazed", wetEdges: false, flow: 95 },
          overrides: { flow: 68, rimMode: "off", rimStrength: 0.0 },
        },
      },

      {
        id: "pc-wood-charcoal",
        name: "Wood Charcoal",
        subtitle: "streaky, dry",
        params: [
          p("size", "Size", "size", 16, 1, 120, 1, true),
          p("flow", "Flow", "flow", 90),
          p("smoothing", "Smoothing", "smoothing", 16),
          p("grain", "Grain", "grain", 72),
        ],
        engine: {
          backend: "stamping",
          strokePath: {
            spacing: 3.6,
            jitter: 10,
            scatter: 1.0,
            streamline: 16,
            count: 1,
          },
          shape: { type: "charcoal", softness: 50, sizeScale: 1.05 },
          grain: { kind: "noise", depth: 72, scale: 1.3 },
          rendering: { mode: "glazed", wetEdges: false, flow: 95 },
          overrides: { flow: 68, rimMode: "off", rimStrength: 0.0 },
        },
      },

      {
        id: "pc-conte-crayon",
        name: "Conté Crayon",
        subtitle: "dense sandy particulates",
        params: [
          p("size", "Size", "size", 18, 1, 140, 1, true),
          p("flow", "Flow", "flow", 70),
          p("smoothing", "Smoothing", "smoothing", 18),
          p("grain", "Grain", "grain", 20),
        ],
        engine: {
          backend: "spray",
          strokePath: {
            spacing: 8,
            jitter: 10,
            scatter: 28,
            streamline: 18,
            count: 18,
          },
          shape: { type: "spray", softness: 40, sizeScale: 1.0 },
          grain: { kind: "none", depth: 0, scale: 1.0 },
          rendering: { mode: "spray", wetEdges: false, flow: 55 },
        },
      },

      {
        id: "pc-charcoal-grunge",
        name: "Charcoal Grunge",
        subtitle: "heavy texture bands",
        params: [
          p("size", "Size", "size", 22, 1, 160, 1, true),
          p("flow", "Flow", "flow", 65),
          p("smoothing", "Smoothing", "smoothing", 14),
          p("grain", "Grain", "grain", 10),
        ],
        engine: {
          backend: "spray",
          strokePath: {
            spacing: 9,
            jitter: 10,
            scatter: 36,
            streamline: 14,
            count: 24,
          },
          shape: { type: "spray", softness: 45, sizeScale: 1.0 },
          grain: { kind: "none", depth: 0, scale: 1.0 },
          rendering: { mode: "spray", wetEdges: false, flow: 55 },
        },
      },
      {
        id: "pc-charcoal-shader",
        name: "Charcoal Shader",
        subtitle: "broad tonal fill",
        params: [
          p("size", "Size", "size", 24, 1, 180, 1, true),
          p("flow", "Flow", "flow", 45),
          p("smoothing", "Smoothing", "smoothing", 16),
          p("grain", "Grain", "grain", 15),
        ],
        engine: {
          backend: "spray",
          strokePath: {
            spacing: 9,
            jitter: 8,
            scatter: 26,
            streamline: 16,
            count: 18,
          },
          shape: { type: "spray", softness: 40, sizeScale: 1.05 },
          grain: { kind: "none", depth: 0, scale: 1.0 },
          rendering: { mode: "spray", wetEdges: false, flow: 50 },
        },
      },
    ],
  },

  /* ---------- Inking ---------- */
  /* ---------- Inking ---------- */
  {
    id: "inking",
    name: "Inking",
    brushes: [
      // 1) Technical Pen — crisp, blunt ends (RIBBON marker)
      {
        id: "ink-technical-pen",
        name: "Technical Pen",
        subtitle: "crisp",
        params: [
          p("size", "Size", "size", 6, 1, 40),
          p("flow", "Flow", "flow", 100),
          p("smoothing", "Smoothing", "smoothing", 35),
        ],
        engine: {
          backend: "ribbon",
          rendering: { mode: "marker" },
          overrides: {
            tipScaleStart: 0.08,
            tipScaleEnd: 0.08,
            tipMinPx: 1.6,
            uniformity: 0.98,
            tipRoundness: 1.0,
          },
        },
      },

      // 2) Studio Pen — clean sharp taper (RIBBON marker)
      {
        id: "ink-studio-pen",
        name: "Studio Pen",
        subtitle: "clean with soft taper",
        params: [
          p("size", "Size", "size", 10, 1, 80),
          p("flow", "Flow", "flow", 100),
          p("smoothing", "Smoothing", "smoothing", 28),
        ],
        engine: {
          backend: "ribbon",
          rendering: { mode: "marker" },
          overrides: {
            tipScaleStart: 0.96,
            tipScaleEnd: 0.96,
            tipMinPx: 0,
            uniformity: 0.25,
            tipRoundness: 0.15,
            thicknessCurve: 1.15,
          },
        },
      },

      // 3) Mercury — soft felt, dull tip (STAMPING)
      {
        id: "ink-mercury",
        name: "Mercury",
        subtitle: "soft felt",
        params: [
          p("size", "Size", "size", 12, 1, 100),
          p("flow", "Flow", "flow", 90),
          p("smoothing", "Smoothing", "smoothing", 24),
          p("spacing", "Spacing", "spacing", 8),
        ],
        engine: {
          backend: "stamping",
          overrides: {
            tipScaleStart: 0.82,
            tipScaleEnd: 0.82,
            tipMinPx: 1.2,
            tipRoundness: 0.65,
            toothBody: 0.18,
            toothFlank: 0.24,
          },
        },
      },

      // 4) Baskerville — angled chisel with taper (RIBBON marker)
      {
        id: "ink-baskerville",
        name: "Baskerville",
        subtitle: "angled chisel",
        params: [
          p("size", "Size", "size", 14, 1, 100),
          p("flow", "Flow", "flow", 100),
          p("smoothing", "Smoothing", "smoothing", 22),
          p("angle", "Angle", "angle", 32, 0, 360),
        ],
        engine: {
          backend: "ribbon",
          rendering: { mode: "marker" },
          overrides: {
            tipScaleStart: 0.94,
            tipScaleEnd: 0.94,
            tipMinPx: 0,
            uniformity: 0.3,
            tipRoundness: 0.15,
            thicknessCurve: 1.15,
          },
        },
      },

      // 5) Inka — draggy tooth, duller tip (STAMPING)
      {
        id: "ink-inka",
        name: "Inka",
        subtitle: "draggy tooth",
        params: [
          p("size", "Size", "size", 12, 1, 100),
          p("flow", "Flow", "flow", 85),
          p("smoothing", "Smoothing", "smoothing", 22),
          p("spacing", "Spacing", "spacing", 10),
        ],
        engine: {
          backend: "stamping",
          overrides: {
            tipScaleStart: 0.8,
            tipScaleEnd: 0.8,
            tipMinPx: 1.6,
            tipRoundness: 0.7,
            toothBody: 0.24,
            toothFlank: 0.3,
          },
        },
      },

      // 6) Pandani — juicy torn edge (STAMPING)
      {
        id: "ink-pandani",
        name: "Pandani",
        subtitle: "juicy torn edge",
        params: [
          p("size", "Size", "size", 16, 1, 120),
          p("flow", "Flow", "flow", 100),
          p("smoothing", "Smoothing", "smoothing", 20),
          p("spacing", "Spacing", "spacing", 12),
        ],
        engine: {
          backend: "stamping",
          overrides: {
            tipScaleStart: 0.86,
            tipScaleEnd: 0.86,
            tipMinPx: 1.6,
            tipRoundness: 0.75,
            edgeNoiseStrength: 0.35,
            edgeNoiseScale: 8,
            toothBody: 0.28,
            toothFlank: 0.38,
          },
        },
      },

      // 7) Tinderbox — dry brush pen (STAMPING)
      {
        id: "ink-tinderbox",
        name: "Tinderbox",
        subtitle: "dry brush pen",
        params: [
          p("size", "Size", "size", 15, 1, 120),
          p("flow", "Flow", "flow", 85),
          p("smoothing", "Smoothing", "smoothing", 18),
          p("spacing", "Spacing", "spacing", 12),
        ],
        engine: {
          backend: "stamping",
          overrides: {
            tipScaleStart: 0.84,
            tipScaleEnd: 0.84,
            tipMinPx: 1.6,
            tipRoundness: 0.7,
            edgeNoiseStrength: 0.45,
            edgeNoiseScale: 10,
            dryThreshold: 0.2,
            toothBody: 0.32,
            toothFlank: 0.42,
          },
        },
      },

      // 8) Syrup — smooth gel, blunt ends (RIBBON marker)
      {
        id: "ink-syrup",
        name: "Syrup",
        subtitle: "smooth gel",
        params: [
          p("size", "Size", "size", 10, 1, 80),
          p("flow", "Flow", "flow", 100),
          p("smoothing", "Smoothing", "smoothing", 26),
        ],
        engine: {
          backend: "ribbon",
          rendering: { mode: "marker" },
          overrides: {
            tipScaleStart: 0.1,
            tipScaleEnd: 0.1,
            tipMinPx: 1.4,
            uniformity: 0.98,
            tipRoundness: 1.0,
          },
        },
      },

      // 9) Thylacine — parallel tracks (STAMPING for now, split later)
      {
        id: "ink-thylacine",
        name: "Thylacine",
        subtitle: "parallel tracks",
        params: [
          p("size", "Size", "size", 14, 1, 120),
          p("flow", "Flow", "flow", 95),
          p("smoothing", "Smoothing", "smoothing", 20),
          p("spacing", "Spacing", "spacing", 10),
        ],
        engine: {
          backend: "stamping",
          overrides: {
            tipScaleStart: 0.1,
            tipScaleEnd: 0.1,
            tipMinPx: 1.0,
            uniformity: 0.95,
            tipRoundness: 1.0,
            splitCount: 4,
            splitSpacing: 3.5,
          },
        },
      },

      // 10) Gel Pen — slick, bulbous ends (RIBBON marker)
      {
        id: "ink-gel-pen",
        name: "Gel Pen",
        subtitle: "slick, even",
        params: [
          p("size", "Size", "size", 8, 1, 80),
          p("flow", "Flow", "flow", 100),
          p("smoothing", "Smoothing", "smoothing", 24),
        ],
        engine: {
          backend: "ribbon",
          rendering: { mode: "marker" },
          overrides: {
            tipScaleStart: 0.08,
            tipScaleEnd: 0.08,
            tipMinPx: 1.8,
            uniformity: 1.0,
            thicknessCurve: 0.9,
            tipRoundness: 1.0,
          },
        },
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
        engine: engines.watercolor(),
        // BLEND: ["wet","stamping"]  — nice future upgrade for hard/soft edges.
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
        // BLEND: ["wet","spray"] — to add micro granulation speckle later.
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
        // BLEND: ["impasto","stamping"] — impasto height + soft glazing.
      },
      {
        id: "oil-impasto",
        name: "Oil Impasto",
        subtitle: "thick paint",
        params: [
          p("size", "Size", "size", 26, 1, 140, 1, true),
          p("flow", "Flow", "flow", 80),
          p("spacing", "Spacing", "spacing", 18),
          p("grain", "Grain", "grain", 65),
        ],
        engine: engines.impasto(),
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
        engine: engines.spray(),
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
      {
        id: "hatch-pattern",
        name: "Hatch Pattern",
        subtitle: "lined fill",
        params: [
          p("size", "Size", "size", 18, 1, 120, 1, true),
          p("spacing", "Spacing", "spacing", 16),
          p("angle", "Angle", "angle", 0, 0, 360),
          p("opacity", "Opacity", "opacity", 100),
        ],
        engine: engines.pattern(),
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
      {
        id: "particle-dust",
        name: "Particle Dust",
        subtitle: "orbiting flecks",
        params: [
          p("size", "Size", "size", 20, 1, 140, 1, true),
          p("flow", "Flow", "flow", 60),
          p("spacing", "Spacing", "spacing", 22),
          p("opacity", "Opacity", "opacity", 80),
        ],
        engine: engines.particle(),
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
      {
        id: "woven-impasto",
        name: "Woven Impasto",
        subtitle: "raised fabric",
        params: [
          p("size", "Size", "size", 24),
          p("flow", "Flow", "flow", 80),
          p("spacing", "Spacing", "spacing", 20),
          p("grain", "Grain", "grain", 70),
        ],
        engine: engines.impasto(),
        // BLEND: ["impasto","pattern"] — height + oriented hatch.
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
export const BRUSH_BY_ID: Record<string, BrushPreset> = Object.fromEntries(
  BRUSH_CATEGORIES.flatMap((c) => c.brushes.map((b) => [b.id, b]))
);
