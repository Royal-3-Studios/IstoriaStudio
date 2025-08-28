// =============================================================
// src/components/editor/types.ts
// =============================================================
export type ToolId =
  | "move"
  | "select"
  | "crop"
  | "brush"
  | "eraser"
  | "fill"
  | "gradient"
  | "clone"
  | "smudge"
  | "text"
  | "shape"
  | "line"
  | "pen"
  | "eyedropper";

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten";

export type StrokeStyle = "solid" | "dashed" | "dotted";
export type LineCap = "butt" | "round" | "square";
export type LineJoin = "miter" | "round" | "bevel";
export type TextAlignX = "left" | "center" | "right" | "justify";

export type BooleanOp = "union" | "subtract" | "intersect" | "exclude";
export type PathAlign =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom";

export type BrushStyle =
  | "solid"
  | "marker"
  | "calligraphy"
  | "spray"
  | "pencil";

export interface ToolOptions {
  stroke?: string;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
  fill?: string;
  opacity?: number;
  blendMode?: BlendMode;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  textAlign?: TextAlignX;
  lineCap?: LineCap;
  lineJoin?: LineJoin;
  brushStyle?: BrushStyle; // NEW: advanced brush style
  hardness?: number; // 0-100
  spacing?: number; // 1-100 (% of diameter)
  flow?: number; // 1-100
  alpha?: number; // 0-100
  pressure?: boolean; // pressure sensitivity
  smoothing?: number; // 0-100 path smoothing
}
