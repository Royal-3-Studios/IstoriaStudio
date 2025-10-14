// FILE: src/data/brushPresets.ts
// Types-only shim. The actual data now lives in brushPresets.generated.ts.

import type { EngineConfig } from "@/lib/brush/engine.types";

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
  show?: boolean;
};

/* =============== Small “nice-to-have” meta hints =============== */
/** Optional UI/runtime hints for certain categories (Luminance / Touch-ups). */
export type BrushPresetMeta = {
  /** Luminance: hint UI to treat as “emissive” (glow badges, dark preview bg, etc.). */
  emissive?: boolean;
  /** Touch-ups/Vintage: default blend you want the preview/UI to favor. */
  defaultBlendMode?: GlobalCompositeOperation;
};

/* ================= Catalog Types ================= */

export type BrushPreset = {
  id: string;
  name: string;
  subtitle?: string;
  params: BrushParam[];
  engine: EngineConfig;
  /** Optional discovery/organization tags (e.g., "textured", "thin", "pencil"). */
  tags?: string[];
  /**
   * Optional input pipeline metadata…
   */
  input?: BrushInputConfig;

  /** Optional category-specific hints (nice-to-have). */
  meta?: BrushPresetMeta;
};

export type BrushCategory = {
  id: string;
  name: string;
  brushes: BrushPreset[];
};

export type BrushId = BrushPreset["id"];

/* ================= Input Pipeline Types (unchanged) ================= */

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
      speedRange: [number, number];
      minPressure: number;
      maxPressure: number;
      curve: "linear" | "easeIn" | "easeOut" | "easeInOut";
    };

export type BrushInputConfig = {
  pressure: {
    clamp: { min: number; max: number };
    curve: PressureCurve;
    smoothing: PressureSmoothing;
    velocityComp?: { k: number; refSpeed: number };
    synth?: PressureSynth;
    gain?: number;
    deadZone?: number;
  };
  quality?: {
    predictPx?: number;
    speedToSpacing?: number;
    minStepPx?: number;
  };
};

/* ================= Re-exports ================= */
export * from "./brushPresets.generated";
