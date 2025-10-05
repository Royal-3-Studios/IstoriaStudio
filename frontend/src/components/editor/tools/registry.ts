// =============================================================
// src/components/editor/tools/registry.ts
// Single source of truth for tool metadata (icon + label)
// =============================================================
import type { ComponentType, SVGProps } from "react";
import {
  Hand,
  MousePointer2,
  Crop,
  Brush,
  Eraser,
  PaintBucket,
  Pipette,
  Type,
  Shapes,
  Minus,
  PenTool,
  Stamp,
  Droplet,
  Palette,
} from "lucide-react";
import type { ToolId } from "../types";

// Type for lucide icons (and any SVG React icon)
export type IconType = ComponentType<SVGProps<SVGSVGElement>>;

export const TOOL_META: Record<ToolId, { label: string; icon: IconType }> = {
  move: { label: "Move", icon: Hand },
  select: { label: "Select", icon: MousePointer2 },
  crop: { label: "Crop", icon: Crop },
  brush: { label: "Brush", icon: Brush },
  eraser: { label: "Eraser", icon: Eraser },
  fill: { label: "Fill", icon: PaintBucket },
  gradient: { label: "Gradient", icon: Palette },
  clone: { label: "Clone/Stamp", icon: Stamp },
  smudge: { label: "Smudge/Blur", icon: Droplet },
  text: { label: "Text", icon: Type },
  shape: { label: "Shape", icon: Shapes },
  line: { label: "Line", icon: Minus },
  pen: { label: "Pen", icon: PenTool },
  eyedropper: { label: "Eyedropper", icon: Pipette },
};

export const ALL_TOOLS: ToolId[] = Object.keys(TOOL_META) as ToolId[];
