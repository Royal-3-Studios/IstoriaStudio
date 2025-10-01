// FILE: src/lib/brush/backends/stamping/index.ts
import type { Ctx2D } from "@/lib/canvas/context";
import type {
  RenderOptions,
  StampingOverrides,
  StampingRenderingMode,
} from "@/lib/brush/engine.types";
import { drawGraphite } from "./graphite";
import { drawInk } from "./ink";

export const backendId = "stamping" as const;

type StampingMode = StampingRenderingMode; // "ink" | "graphite"

function pickStampingModeNormalized(opt: RenderOptions): StampingMode {
  // 1) Backend-specific override wins (if provided)
  const bo = (opt.engine.backendOverrides?.stamping ?? {}) as StampingOverrides;
  const m1 = bo.renderingMode;
  if (m1 === "ink" || m1 === "graphite") return m1;

  // 2) Generic cross-backend override (legacy/compat)
  const m2 = (opt.engine.overrides as { renderingMode?: unknown } | undefined)
    ?.renderingMode;
  if (m2 === "ink" || m2 === "graphite") return m2;

  // 3) Rendering intent hint
  const intent = opt.engine.rendering?.intent;
  if (intent === "ink" || intent === "marker") return "ink";
  if (intent === "graphite" || intent === "charcoal") return "graphite";

  // 4) Heuristics as a last resort (shape/grain)
  const shapeType = opt.engine.shape?.type;
  const grainKind = opt.engine.grain?.kind ?? "none";
  if (shapeType === "charcoal") return "graphite";
  if (grainKind !== "none" && shapeType !== "round") return "graphite";

  // 5) Safe default
  return "graphite";
}

export default function drawStamping(ctx: Ctx2D, options: RenderOptions): void {
  const mode = pickStampingModeNormalized(options);
  if (mode === "ink") {
    drawInk(ctx, options);
  } else {
    drawGraphite(ctx, options);
  }
}
