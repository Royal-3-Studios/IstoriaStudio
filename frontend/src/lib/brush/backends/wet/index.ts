// FILE: src/lib/brush/backends/wet/index.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import { type Ctx2D, type CanvasLike, get2D } from "@backends/utils/canvas";

import { drawWetWash } from "./variants/wash";
import { drawWetGlaze } from "./variants/glaze";
import { drawWetEdge } from "./variants/edge";
import { drawWetBloom } from "./variants/bloom";
import { drawWetLift } from "./variants/lift";

// Normalize tilt routing (tilt→size/fan/grainScale/edgeNoise) once per backend:
import { getTiltOverrides } from "@backends/stamping/utils/scalars";

export type WetMode = "wash" | "glaze" | "edge" | "bloom" | "lift";

function isWetMode(x: unknown): x is WetMode {
  return (
    x === "wash" ||
    x === "glaze" ||
    x === "edge" ||
    x === "bloom" ||
    x === "lift"
  );
}

export function pickWetMode(opt: RenderOptions): WetMode {
  const m = (opt.engine.backendOverrides?.wet as { mode?: unknown } | undefined)
    ?.mode;
  return isWetMode(m) ? m : "wash";
}

/** Core entry: draw using the selected wet variant. */
export default function draw(ctx: Ctx2D, opt: RenderOptions): void {
  // --- Normalize tilt knobs ONCE here, then pass to all variants -------------
  const tilt = getTiltOverrides(opt.engine.overrides);

  // Merge into engine.overrides so variants can read `ov.tiltToFan`, etc.
  const optWithTilt: RenderOptions = {
    ...opt,
    engine: {
      ...opt.engine,
      overrides: {
        ...(opt.engine.overrides ?? {}),
        ...tilt,
      },
    },
  };

  switch (pickWetMode(optWithTilt)) {
    case "glaze":
      drawWetGlaze(ctx, optWithTilt);
      break;
    case "edge":
      drawWetEdge(ctx, optWithTilt);
      break;
    case "bloom":
      drawWetBloom(ctx, optWithTilt);
      break;
    case "lift":
      drawWetLift(ctx, optWithTilt);
      break;
    case "wash":
    default:
      drawWetWash(ctx, optWithTilt);
      break;
  }
}

/** Standard convenience: accept a canvas surface, fetch 2D, then draw. */
export function drawToCanvas(surface: CanvasLike, opt: RenderOptions): void {
  const ctx = get2D(surface);
  draw(ctx, opt);
}
