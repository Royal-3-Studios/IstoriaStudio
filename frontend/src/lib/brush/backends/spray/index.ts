// FILE: src/lib/brush/backends/spray/index.ts
import type { RenderOptions } from "@/lib/brush/engine";
import type { Ctx2D } from "./utils/canvas";

import { drawSprayAirbrush } from "./variants/airbrush";
import { drawSpraySplatter } from "./variants/splatter";
import { drawSprayNozzle } from "./variants/nozzle";
import { drawSprayStipple } from "./variants/stipple";

export const backendId = "spray" as const;

export type SprayMode = "airbrush" | "splatter" | "nozzle" | "stipple";

/** Optional backend-local override shape you can pass via engine.backendOverrides.spray */
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

function pickSprayMode(opt: RenderOptions): SprayMode {
  const spr = opt.engine.backendOverrides?.spray as SprayOverrides | undefined;
  const m = spr?.mode;
  return isSprayMode(m) ? m : "airbrush";
}

export default function drawSpray(ctx: Ctx2D, opt: RenderOptions): void {
  const mode = pickSprayMode(opt);
  switch (mode) {
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
