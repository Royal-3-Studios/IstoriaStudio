// =============================================================
// src/components/editor/types.ts
// =============================================================

// Re-export engine-facing types so existing UI imports still work
export type {
  BrushBackend,
  RenderingMode,
  BlendMode,
} from "@/lib/brush/core/types";

// in src/lib/brush/engine.ts (or backends)
import type { BlendMode } from "@/lib/brush/core/types";

// --- Everything below stays exactly as you have it ---
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
  blendMode?: BlendMode; // ← still available via re-export
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  textAlign?: TextAlignX;
  lineCap?: LineCap;
  lineJoin?: LineJoin;
  brushStyle?: BrushStyle;
  hardness?: number; // UI -> engine converts to softness
  spacing?: number;
  flow?: number;
  alpha?: number; // (you can remove later if redundant with opacity)
  pressure?: boolean;
  smoothing?: number;
  brushId?: string;
}
