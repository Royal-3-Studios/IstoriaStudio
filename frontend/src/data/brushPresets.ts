// src/data/brushPresets.ts
export type BrushParamType =
  | "size" // px (1..200)
  | "hardness" // %
  | "flow" // %
  | "spacing" // %
  | "smoothing" // %
  | "angle" // degrees
  | "jitterSize" // %
  | "jitterAngle" // %
  | "grain" // %
  | "opacity" // % (alias of alpha in your ToolOptions)
  | "custom"; // future (text, selects, etc.)

export type BrushParam = {
  key: string; // e.g. "size"
  label: string; // "Size"
  type: BrushParamType;
  min?: number;
  max?: number;
  step?: number;
  defaultValue: number;
  show?: boolean; // conditionally show
};

export type BrushPreset = {
  id: string; // unique
  name: string; // e.g. "Storm Bay"
  params: BrushParam[]; // controls for this brush
};

export type BrushCategory = {
  id: string; // e.g. "abstract"
  name: string; // "Abstract"
  brushes: BrushPreset[];
};

export const BRUSH_CATEGORIES: BrushCategory[] = [
  {
    id: "sketching",
    name: "Sketching",
    brushes: [
      {
        id: "pencil2h",
        name: "Pencil 2H",
        params: [
          {
            key: "size",
            label: "Size",
            type: "size",
            min: 1,
            max: 50,
            step: 1,
            defaultValue: 4,
          },
          {
            key: "hardness",
            label: "Hardness",
            type: "hardness",
            min: 0,
            max: 100,
            step: 1,
            defaultValue: 90,
          },
          {
            key: "flow",
            label: "Flow",
            type: "flow",
            min: 1,
            max: 100,
            step: 1,
            defaultValue: 70,
          },
          {
            key: "spacing",
            label: "Spacing",
            type: "spacing",
            min: 1,
            max: 100,
            step: 1,
            defaultValue: 15,
          },
          {
            key: "smoothing",
            label: "Smoothing",
            type: "smoothing",
            min: 0,
            max: 100,
            step: 1,
            defaultValue: 20,
          },
          {
            key: "jitterSize",
            label: "Size Jitter",
            type: "jitterSize",
            min: 0,
            max: 100,
            step: 1,
            defaultValue: 5,
          },
        ],
      },
      {
        id: "softGraphite",
        name: "Soft Graphite",
        params: [
          {
            key: "size",
            label: "Size",
            type: "size",
            min: 1,
            max: 80,
            step: 1,
            defaultValue: 14,
          },
          {
            key: "hardness",
            label: "Hardness",
            type: "hardness",
            min: 0,
            max: 100,
            step: 1,
            defaultValue: 70,
          },
          {
            key: "flow",
            label: "Flow",
            type: "flow",
            min: 1,
            max: 100,
            step: 1,
            defaultValue: 85,
          },
          {
            key: "spacing",
            label: "Spacing",
            type: "spacing",
            min: 1,
            max: 100,
            step: 1,
            defaultValue: 10,
          },
          {
            key: "smoothing",
            label: "Smoothing",
            type: "smoothing",
            min: 0,
            max: 100,
            step: 1,
            defaultValue: 25,
          },
        ],
      },
    ],
  },
  {
    id: "inking",
    name: "Inking",
    brushes: [
      {
        id: "technicalPen",
        name: "Technical Pen",
        params: [
          {
            key: "size",
            label: "Size",
            type: "size",
            min: 1,
            max: 40,
            step: 1,
            defaultValue: 6,
          },
          {
            key: "hardness",
            label: "Hardness",
            type: "hardness",
            min: 0,
            max: 100,
            step: 1,
            defaultValue: 100,
          },
          {
            key: "flow",
            label: "Flow",
            type: "flow",
            min: 1,
            max: 100,
            step: 1,
            defaultValue: 100,
          },
          {
            key: "spacing",
            label: "Spacing",
            type: "spacing",
            min: 1,
            max: 100,
            step: 1,
            defaultValue: 8,
          },
          {
            key: "smoothing",
            label: "Smoothing",
            type: "smoothing",
            min: 0,
            max: 100,
            step: 1,
            defaultValue: 35,
          },
          {
            key: "angle",
            label: "Angle",
            type: "angle",
            min: 0,
            max: 360,
            step: 1,
            defaultValue: 0,
          },
        ],
      },
    ],
  },
  {
    id: "abstract",
    name: "Abstract",
    brushes: [
      {
        id: "stormBay",
        name: "Storm Bay",
        params: [
          {
            key: "size",
            label: "Size",
            type: "size",
            min: 1,
            max: 120,
            step: 1,
            defaultValue: 24,
          },
          {
            key: "flow",
            label: "Flow",
            type: "flow",
            min: 1,
            max: 100,
            step: 1,
            defaultValue: 80,
          },
          {
            key: "spacing",
            label: "Spacing",
            type: "spacing",
            min: 1,
            max: 100,
            step: 1,
            defaultValue: 20,
          },
          {
            key: "jitterAngle",
            label: "Angle Jitter",
            type: "jitterAngle",
            min: 0,
            max: 100,
            step: 1,
            defaultValue: 40,
          },
          {
            key: "grain",
            label: "Grain",
            type: "grain",
            min: 0,
            max: 100,
            step: 1,
            defaultValue: 30,
          },
        ],
      },
      {
        id: "waveform",
        name: "Waveform",
        params: [
          {
            key: "size",
            label: "Size",
            type: "size",
            min: 1,
            max: 120,
            step: 1,
            defaultValue: 18,
          },
          {
            key: "flow",
            label: "Flow",
            type: "flow",
            min: 1,
            max: 100,
            step: 1,
            defaultValue: 65,
          },
          {
            key: "spacing",
            label: "Spacing",
            type: "spacing",
            min: 1,
            max: 100,
            step: 1,
            defaultValue: 12,
          },
          {
            key: "jitterSize",
            label: "Size Jitter",
            type: "jitterSize",
            min: 0,
            max: 100,
            step: 1,
            defaultValue: 25,
          },
          {
            key: "opacity",
            label: "Opacity",
            type: "opacity",
            min: 1,
            max: 100,
            step: 1,
            defaultValue: 80,
          },
        ],
      },
    ],
  },
];

// helpful lookup maps
export const BRUSH_BY_ID = Object.fromEntries(
  BRUSH_CATEGORIES.flatMap((c) => c.brushes.map((b) => [b.id, b]))
) as Record<string, BrushPreset>;

export const CATEGORY_BY_ID = Object.fromEntries(
  BRUSH_CATEGORIES.map((c) => [c.id, c])
) as Record<string, BrushCategory>;
