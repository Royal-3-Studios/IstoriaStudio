// FILE: src/data/brushPresets.ts
// Types-only shim. The actual data now lives in brushPresets.generated.ts.

import type { EngineConfig } from "@/lib/brush/engine";

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
  engine: EngineConfig;
  /** Optional discovery/organization tags (e.g., "textured", "thin", "pencil"). */
  tags?: string[];
  /**
   * Optional input pipeline metadata. If present, your pointer/pen samples can be
   * routed through a filter (pressure curve, smoothing, mouse synth, etc.)
   * before reaching the brush engine.
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

/* ================= Input Pipeline Types =================
   These are intentionally lightweight and UI-focused. Your engine/runtime can
   accept the same shapes or a superset without coupling the types here. */

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

export type BrushInputConfig = {
  /** clamp & shape the incoming pressure signal */
  pressure: {
    clamp: { min: number; max: number };
    curve: PressureCurve;
    smoothing: PressureSmoothing;
    /** optional velocity→pressure compensation; higher speeds reduce pressure */
    velocityComp?: { k: number; refSpeed: number };
    /** optional pressure synthesis for devices without pressure */
    synth?: PressureSynth;
  };
  /** event → stroke sampling quality hints */
  quality: {
    /** look-ahead / prediction distance in px */
    predictPx: number;
    /** factor to increase spacing as speed increases (0..~0.5 typical) */
    speedToSpacing: number;
    /** minimum resampling step in px */
    minStepPx: number;
  };
};

/* ================= Re-exports =================
   The generated file should export BRUSH_CATEGORIES and BRUSH_BY_ID.
   Keep all data in the generated module; this file only defines the types. */

export * from "./brushPresets.generated";
