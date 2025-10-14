// FILE: src/lib/brush/backends/smudge/index.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import { type Ctx2D, type CanvasLike, get2D } from "@backends/utils/canvas";

import { drawSmudgeSoft } from "./variants/soft";
import { drawSmudgeStreak } from "./variants/streak";
import { drawSmudgeOily } from "./variants/oily";

// Normalize tilt routing (tilt→size/fan/grainScale/edgeNoise) once per backend
import { getTiltOverrides } from "@backends/stamping/utils/scalars";

export type SmudgeMode = "soft" | "streak" | "oily";

export type SmudgeOverrides = Partial<{
  mode: SmudgeMode;

  // shared knobs
  strength: number; // 0..2
  alphaMul: number; // 0..2
  radiusGain: number; // 0.2..3
  softenPx: number; // px
  spacing: number; // % → overrides strokePath.spacing

  // drag (streak/soft)
  anisotropy: number; // 0..1
  alignWithTangent: number; // 0..1
  falloff: "gaussian" | "cosine";
  maxOffsetPx: number; // px

  // mixer (oily)
  pickup: number; // 0..1
  laydown: number; // 0..1
  liftAmount: number; // 0..1
  mixFalloff: "gaussian" | "cosine";

  // optional dissolve post
  dissolve: boolean;
  dissolveAmount: number; // 0..1
  dissolveScale: number; // px
}>;

export function pickMode(opt: RenderOptions): SmudgeMode {
  const o = opt.engine.backendOverrides?.smudge as SmudgeOverrides | undefined;
  const m = o?.mode;
  return m === "streak" || m === "oily" ? m : "soft";
}

/** Core entry */
export default function drawSmudge(ctx: Ctx2D, opt: RenderOptions): void {
  // Normalize tilt knobs once and merge into engine.overrides
  const tilt = getTiltOverrides(opt.engine.overrides);
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
    case "streak":
      drawSmudgeStreak(ctx, optWithTilt);
      break;
    case "oily":
      drawSmudgeOily(ctx, optWithTilt);
      break;
    case "soft":
    default:
      drawSmudgeSoft(ctx, optWithTilt);
      break;
  }
}

/** Convenience */
export function drawToCanvas(surface: CanvasLike, opt: RenderOptions): void {
  const ctx = get2D(surface);
  drawSmudge(ctx, opt);
}
