// src/lib/brush/core/types.ts

// Backend & rendering unions stay as-is — but freeze them for better literals.
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

// Keep BlendMode — make it line up with Canvas 2D ops you use elsewhere.
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

// Modulation plumbing (unchanged unions)
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

/**
 * With exactOptionalPropertyTypes enabled, optional fields are "absent" rather than undefined.
 * Keep them optional here, but ALWAYS read them via helpers that supply defaults (see below).
 */
export type ModRoute = {
  input: ModInput;
  target: ModTarget;
  amount?: number; // -1..+1 after curve
  mode?: "add" | "mul" | "replace";
  curve?: ReadonlyArray<CurvePoint>;
  min?: number;
  max?: number;
};

export type EngineModulations = { routes: ReadonlyArray<ModRoute> };

// Grain/taper unions unchanged
export type GrainMotion = "paperLocked" | "tipLocked" | "smudgeLocked";
export type TaperProfile =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "expo"
  | "custom";

/** Lightweight pixel container — keep as typed array to avoid number|undefined on indexing. */
export type RGBA = { r: number; g: number; b: number; a: number }; // 0..1
export type PixelBuf = {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
};
