// src/lib/brush/types.ts

// Engine-facing types — shared by engine & UI

export type BrushBackend = "ribbon" | "stamping" | "spray" | "wet" | "auto";

export type RenderingMode =
  | "LightGlaze"
  | "UniformedGlaze"
  | "IntenseGlaze"
  | "HeavyGlaze"
  | "UniformBlending"
  | "IntenseBlending";

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

// (Optional, add later if you want Apple Pencil mappings baked in here)
// export type InputSignal = 'pressure' | 'tilt' | 'azimuth' | 'speed' | 'barrel' | 'squeeze';
// export type TargetParam = 'size' | 'opacity' | 'flow' | 'spacing' | 'scatter' | 'rotation' | 'grainDepth' | 'grainScale';
// export type CurveKind = 'linear' | 'expo' | 'inv' | 'ease';
// export interface DynamicMap { input: InputSignal; target: TargetParam; curve?: CurveKind; min: number; max: number; }
