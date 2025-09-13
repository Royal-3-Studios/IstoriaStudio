// src/lib/brush/types.ts
// Engine-facing types — shared by engine & UI

export type BrushBackend = import("@/lib/brush/engine").BrushBackend;
export type RenderingMode = import("@/lib/brush/engine").RenderingMode;

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
