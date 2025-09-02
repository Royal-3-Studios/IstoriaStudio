// src/components/editor/tools/brush/brushControlSchema.ts
export type ControlKind = "slider" | "toggle" | "select";

export type ControlDef = {
  key: string; // state key (number)
  label: string;
  kind: ControlKind;
  min?: number;
  max?: number;
  step?: number;
  // for select
  options?: string[]; // labels; stored value = index
  // default used for display when value is missing; we don't auto-write
  defaultValue: number;
};

export type SectionDef = {
  id:
    | "strokePath"
    | "stabilization"
    | "shape"
    | "grain"
    | "rendering"
    | "wetMix"
    | "colorDynamics"
    | "dynamics"
    | "pencil"
    | "properties"
    | "materials"
    | "about";
  name: string;
  controls: ControlDef[];
};

/**
 * Controls aligned with Procreate categories.
 * Values are numeric:
 *  - toggles: 0/1
 *  - selects: index into options[]
 *  - sliders: min..max
 */
export const BRUSH_SECTIONS: SectionDef[] = [
  {
    id: "strokePath",
    name: "Stroke Path",
    controls: [
      {
        key: "spacing",
        label: "Spacing",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 12,
      },
      {
        key: "streamline",
        label: "StreamLine",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 35,
      },
      {
        key: "jitterPath",
        label: "Jitter",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 8,
      },
      {
        key: "scatter",
        label: "Scatter",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 0,
      },
      {
        key: "stampCount",
        label: "Stamp Count",
        kind: "slider",
        min: 1,
        max: 20,
        step: 1,
        defaultValue: 1,
      },
    ],
  },
  {
    id: "stabilization",
    name: "Stabilization",
    controls: [
      {
        key: "stabilize",
        label: "Stabilization",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 30,
      },
      {
        key: "motionFilter",
        label: "Motion Filter",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 20,
      },
      {
        key: "pressFilter",
        label: "Pressure Filter",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 0,
      },
      {
        key: "speedFilter",
        label: "Speed Filter",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 0,
      },
    ],
  },
  {
    id: "shape",
    name: "Shape",
    controls: [
      {
        key: "shapeType",
        label: "Tip Shape",
        kind: "select",
        options: ["Round", "Oval", "Chisel", "Square", "Spray", "Charcoal"],
        defaultValue: 0,
      },
      {
        key: "angle",
        label: "Rotation",
        kind: "slider",
        min: 0,
        max: 360,
        step: 1,
        defaultValue: 0,
      },
      {
        key: "roundness",
        label: "Roundness",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 60,
      },
      {
        key: "softness",
        label: "Softness",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 30,
      },
      {
        key: "shapeScatter",
        label: "Scatter",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 0,
      },
    ],
  },
  {
    id: "grain",
    name: "Grain",
    controls: [
      {
        key: "grainKind",
        label: "Grain",
        kind: "select",
        options: ["None", "Paper", "Canvas", "Noise"],
        defaultValue: 1,
      },
      {
        key: "grainDepth",
        label: "Depth",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 40,
      },
      {
        key: "grainScale",
        label: "Scale",
        kind: "slider",
        min: 0,
        max: 200,
        step: 1,
        defaultValue: 100,
      },
      {
        key: "grainRotate",
        label: "Rotation",
        kind: "slider",
        min: 0,
        max: 360,
        step: 1,
        defaultValue: 0,
      },
      {
        key: "grainMove",
        label: "Movement",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 0,
      },
    ],
  },
  {
    id: "rendering",
    name: "Rendering",
    controls: [
      {
        key: "renderMode",
        label: "Mode",
        kind: "select",
        options: [
          "Uniform Glaze",
          "Light Glaze",
          "Heavy Glaze",
          "Wet Mix",
          "Blended",
          "Intense Glaze",
        ],
        defaultValue: 0,
      },
      {
        key: "flow",
        label: "Flow",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 75,
      },
      { key: "wetEdges", label: "Wet Edges", kind: "toggle", defaultValue: 0 },
      {
        key: "burn",
        label: "Burn",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 0,
      },
      {
        key: "blend",
        label: "Blending",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 0,
      },
    ],
  },
  {
    id: "wetMix",
    name: "Wet Mix",
    controls: [
      {
        key: "dilution",
        label: "Dilution",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 50,
      },
      {
        key: "charge",
        label: "Charge",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 50,
      },
      {
        key: "attack",
        label: "Attack",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 30,
      },
      {
        key: "pull",
        label: "Pull",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 40,
      },
    ],
  },
  {
    id: "colorDynamics",
    name: "Color Dynamics",
    controls: [
      {
        key: "hueJitter",
        label: "Hue Jitter",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 0,
      },
      {
        key: "satJitter",
        label: "Sat Jitter",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 0,
      },
      {
        key: "brightJitter",
        label: "Bright Jitter",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 0,
      },
      { key: "perStamp", label: "Per Stamp", kind: "toggle", defaultValue: 0 },
    ],
  },
  {
    id: "dynamics",
    name: "Dynamics",
    controls: [
      {
        key: "dynJitter",
        label: "Jitter",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 0,
      },
      {
        key: "speedOpacity",
        label: "Speed→Opacity",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 0,
      },
      {
        key: "speedSize",
        label: "Speed→Size",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 0,
      },
      {
        key: "fade",
        label: "Fade",
        kind: "slider",
        min: 0,
        max: 2000,
        step: 10,
        defaultValue: 0,
      },
    ],
  },
  {
    id: "pencil",
    name: "Apple Pencil",
    controls: [
      {
        key: "pressSize",
        label: "Pressure→Size",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 60,
      },
      {
        key: "pressOpacity",
        label: "Pressure→Opacity",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 50,
      },
      {
        key: "tiltSize",
        label: "Tilt→Size",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 30,
      },
      {
        key: "bleed",
        label: "Bleed",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 20,
      },
    ],
  },
  {
    id: "properties",
    name: "Properties",
    controls: [
      {
        key: "sizeMin",
        label: "Min Size",
        kind: "slider",
        min: 1,
        max: 200,
        step: 1,
        defaultValue: 1,
      },
      {
        key: "sizeMax",
        label: "Max Size",
        kind: "slider",
        min: 1,
        max: 200,
        step: 1,
        defaultValue: 120,
      },
      {
        key: "opMin",
        label: "Min Opacity",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 0,
      },
      {
        key: "opMax",
        label: "Max Opacity",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 100,
      },
      {
        key: "asStamp",
        label: "Usable as Stamp",
        kind: "toggle",
        defaultValue: 0,
      },
    ],
  },
  {
    id: "materials",
    name: "Materials",
    controls: [
      {
        key: "metallic",
        label: "Metallicity",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 0,
      },
      {
        key: "roughness",
        label: "Roughness",
        kind: "slider",
        min: 0,
        max: 100,
        step: 1,
        defaultValue: 50,
      },
    ],
  },
  {
    id: "about",
    name: "About This Brush",
    controls: [
      // purely informational in Procreate; keep a couple toggles as placeholders
      {
        key: "lockSettings",
        label: "Lock Settings",
        kind: "toggle",
        defaultValue: 0,
      },
      { key: "shareable", label: "Shareable", kind: "toggle", defaultValue: 1 },
    ],
  },
];
