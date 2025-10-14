// FILE: src/lib/brush/backends/spray/index.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import { type Ctx2D, type CanvasLike, get2D } from "@backends/utils/canvas";

import { drawSprayAirbrush } from "./variants/airbrush";
import { drawSpraySplatter } from "./variants/splatter";
import { drawSprayNozzle } from "./variants/nozzle";
import { drawSprayStipple } from "./variants/stipple";

// Normalize tilt routing (tilt→size/fan/grainScale/edgeNoise) once per backend:
import { getTiltOverrides } from "@backends/stamping/utils/scalars";

export type SprayMode = "airbrush" | "splatter" | "nozzle" | "stipple";

export type SprayOverrides = Partial<{
  mode: SprayMode;
  dropletCount: number;
  dropletJitter: number; // 0..1
  dropletSizeMin: number; // px
  dropletSizeMax: number; // px
  sizeJitter: number; // 0..1
  alphaMin: number; // 0..1
  alphaMax: number; // 0..1
  coneAngleDeg: number; // degrees
  speedToDensity: number; // -1..+1
  colorJitter?: { h?: number; s?: number; l?: number; perDroplet?: boolean };
}>;

function isSprayMode(v: unknown): v is SprayMode {
  return (
    v === "airbrush" || v === "splatter" || v === "nozzle" || v === "stipple"
  );
}

export function pickMode(opt: RenderOptions): SprayMode {
  const spr = opt.engine.backendOverrides?.spray as SprayOverrides | undefined;
  const m = spr?.mode;
  return isSprayMode(m) ? m : "airbrush";
}

export default function drawSpray(ctx: Ctx2D, opt: RenderOptions): void {
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

  switch (pickMode(optWithTilt)) {
    case "nozzle":
      drawSprayNozzle(ctx, optWithTilt);
      break;
    case "splatter":
      drawSpraySplatter(ctx, optWithTilt);
      break;
    case "stipple":
      drawSprayStipple(ctx, optWithTilt);
      break;
    case "airbrush":
    default:
      drawSprayAirbrush(ctx, optWithTilt);
      break;
  }
}

export function drawToCanvas(surface: CanvasLike, opt: RenderOptions): void {
  const ctx = get2D(surface);
  drawSpray(ctx, opt);
}
