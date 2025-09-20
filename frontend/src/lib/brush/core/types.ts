// src/lib/brush/core/types.ts
// Shared, engine-agnostic types. No imports from engine here.

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

export type RenderingMode = "blended" | "glazed" | "marker" | "spray" | "wet";

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "soft-light"
  | "hard-light"
  | "color-dodge"
  | "color-burn"
  | "darken"
  | "lighten"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity"
  | "linear-dodge"
  | "linear-burn"
  | "vivid-light"
  | "linear-light"
  | "pin-light"
  | "hard-mix"
  | "darker-color"
  | "lighter-color"
  | "subtract"
  | "divide"
  | "behind"
  | "clear";

// Advanced modulation (keep here so backends/utils can use them without engine).
export type ModInput =
  | "pressure"
  | "speed"
  | "tilt"
  | "tiltAltitude"
  | "tiltAzimuth"
  | "random"
  | "strokePos"
  | "stampIndex"
  | "direction";

export type ModTarget =
  | "size"
  | "flow"
  | "opacity"
  | "spacing"
  | "angle"
  | "roundness"
  | "grainScale"
  | "grainRotate"
  | "edgeNoiseStrength"
  | "rimStrength"
  | "splitFan"
  | "splitSpacing"
  | "bellyGain"
  | "uniformity";

export type CurvePoint = { x: number; y: number }; // 0..1 -> 0..1
export type ModRoute = {
  input: ModInput;
  target: ModTarget;
  amount?: number; // -1..+1 after curve
  mode?: "add" | "mul" | "replace";
  curve?: CurvePoint[]; // optional LUT
  min?: number;
  max?: number;
};
export type EngineModulations = { routes: ModRoute[] };

export type GrainMotion = "paperLocked" | "tipLocked" | "smudgeLocked";
export type TaperProfile =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "expo"
  | "custom";

// Lightweight pixel container many utils use.
export type RGBA = { r: number; g: number; b: number; a: number }; // 0..1 linear or sRGB (see docs)
export type PixelBuf = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};
