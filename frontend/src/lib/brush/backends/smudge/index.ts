// FILE: src/lib/brush/backends/smudge/index.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import { type Ctx2D, type CanvasLike, get2D } from "@backends/utils/canvas";

import { drawSmudgeSoft } from "./variants/soft";
import { drawSmudgeStreak } from "./variants/streak";
import { drawSmudgeOily } from "./variants/oily";

export type SmudgeMode = "soft" | "streak" | "oily";

export type SmudgeOverrides = Partial<{
  mode: SmudgeMode;

  // shared knobs
  strength: number; // 0..2  overall effect strength
  alphaMul: number; // 0..2  opacity while stamping
  radiusGain: number; // 0.2..3 radius multiplier vs base size
  softenPx: number; // px blur while stamping
  spacing: number; // % like other backends (overrides strokePath.spacing)

  // drag (streak/soft)
  anisotropy: number; // 0..1  (0 = isotropic; 1 = fully directional)
  alignWithTangent: number; // 0..1
  falloff: "gaussian" | "cosine";
  maxOffsetPx: number; // px cap for drag offset per step

  // mixer (oily)
  pickup: number; // 0..1  how much under-color to load
  laydown: number; // 0..1  how much of buffer to place
  liftAmount: number; // 0..1  optional “watery lift”
  mixFalloff: "gaussian" | "cosine";

  // optional dissolve post (applies to any mode)
  dissolve: boolean;
  dissolveAmount: number; // 0..1 threshold amount
  dissolveScale: number; // px
}>;

function pickMode(opt: RenderOptions): SmudgeMode {
  const o = opt.engine.backendOverrides?.smudge as SmudgeOverrides | undefined;
  const m = o?.mode;
  return m === "streak" || m === "oily" ? m : "soft";
}

/** Core entry: draw using the selected variant. */
export default function drawSmudge(ctx: Ctx2D, opt: RenderOptions): void {
  switch (pickMode(opt)) {
    case "streak":
      drawSmudgeStreak(ctx, opt);
      break;
    case "oily":
      drawSmudgeOily(ctx, opt);
      break;
    case "soft":
    default:
      drawSmudgeSoft(ctx, opt);
      break;
  }
}

/** Standard convenience: accept a canvas surface, fetch 2D, then draw. */
export function drawToCanvas(surface: CanvasLike, opt: RenderOptions): void {
  const ctx = get2D(surface);
  drawSmudge(ctx, opt);
}
