// FILE: src/lib/brush/backends/spray/index.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import {
  type Ctx2D,
  type CanvasLike,
  get2D,
} from "@/lib/brush/backends/utils/canvas";

import { drawSprayAirbrush } from "./variants/airbrush";
import { drawSpraySplatter } from "./variants/splatter";
import { drawSprayNozzle } from "./variants/nozzle";
import { drawSprayStipple } from "./variants/stipple";

export type SprayMode = "airbrush" | "splatter" | "nozzle" | "stipple";

/** Backend-local overrides (attach under engine.backendOverrides.spray) */
export type SprayOverrides = Partial<{
  mode: SprayMode;
  dropletCount: number;
  dropletJitter: number; // 0..1
  dropletSizeMin: number; // px
  dropletSizeMax: number; // px
  sizeJitter: number; // 0..1
  alphaMin: number; // 0..1
  alphaMax: number; // 0..1
  coneAngleDeg: number; // directional spread for nozzle/airbrush
  speedToDensity: number; // -1..+1
  colorJitter?: { h?: number; s?: number; l?: number; perDroplet?: boolean };
}>;

function isSprayMode(v: unknown): v is SprayMode {
  return (
    v === "airbrush" || v === "splatter" || v === "nozzle" || v === "stipple"
  );
}

function pickMode(opt: RenderOptions): SprayMode {
  const spr = opt.engine.backendOverrides?.spray as SprayOverrides | undefined;
  const m = spr?.mode;
  return isSprayMode(m) ? m : "airbrush";
}

/** Core entry: draw using the selected variant. */
export default function drawSpray(ctx: Ctx2D, opt: RenderOptions): void {
  switch (pickMode(opt)) {
    case "nozzle":
      drawSprayNozzle(ctx, opt);
      break;
    case "splatter":
      drawSpraySplatter(ctx, opt);
      break;
    case "stipple":
      drawSprayStipple(ctx, opt);
      break;
    case "airbrush":
    default:
      drawSprayAirbrush(ctx, opt);
      break;
  }
}

/** Convenience: accept a canvas surface, fetch a 2D context, then draw. */
export function drawToCanvas(surface: CanvasLike, opt: RenderOptions): void {
  const ctx = get2D(surface);
  drawSpray(ctx, opt);
}
