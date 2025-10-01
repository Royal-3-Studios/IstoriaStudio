// ========================
// FILE: src/lib/brush/backends/stamping/types.ts
// ========================
import type {
  RenderOptions,
  RenderOverrides,
  RenderPathPoint,
} from "@/lib/brush/engine";
import type { BrushInputConfig } from "@/data/brushPresets";
import type { PressureMapOpts } from "@/lib/brush/core/pressure";
import { CanvasUtil } from "@backends";

export type Ctx2D = CanvasUtil.Ctx2D;
export type RenderingMode = "graphite" | "ink";

export type ExtRenderOptions = RenderOptions & { input?: BrushInputConfig };

export type SamplePoint = { x: number; y: number; t: number; p: number };
export type Gate = {
  tMid: number;
  bellyProgress: number;
  alphaProgress: number;
  midPressure: number;
};

// Re-exports to keep the rest of the code tidy
export type {
  RenderOptions,
  RenderOverrides,
  RenderPathPoint,
  PressureMapOpts,
};
