import type { RenderOptions } from "@/lib/brush/engine";
import type { Ctx2D } from "./utils/canvas";

import { drawSmudgeSoft } from "./variants/soft";
import { drawSmudgeStreak } from "./variants/streak";
import { drawSmudgeOily } from "./variants/oily";

export type SmudgeMode = "soft" | "streak" | "oily";

export type SmudgeOverrides = Partial<{
  mode: SmudgeMode;

  // shared knobs
  strength: number; // 0..2  (overall effect strength)
  alphaMul: number; // 0..2  (opacity while stamping)
  radiusGain: number; // 0.2..3 (radius multiplier vs base size)
  softenPx: number; // px blur while stamping
  spacing?: number; // % like other backends (overrides strokePath.spacing)

  // drag (streak/soft)
  anisotropy: number; // 0..1  (0 = isotropic; 1 = fully directional)
  alignWithTangent: number; // 0..1
  falloff: "gaussian" | "cosine";
  maxOffsetPx: number; // px cap for drag offset per step

  // mixer (oily)
  pickup: number; // 0..1  (how much under-color to load)
  laydown: number; // 0..1  (how much of buffer to place)
  liftAmount: number; // 0..1  (optional “watery lift” inside)
  mixFalloff: "gaussian" | "cosine";

  // optional dissolve post (applies to any mode)
  dissolve?: boolean;
  dissolveAmount?: number; // 0..1 threshold amount
  dissolveScale?: number; // px
}>;

function pickMode(opt: RenderOptions): SmudgeMode {
  const o = opt.engine.backendOverrides?.smudge as SmudgeOverrides | undefined;
  const m = o?.mode;
  if (m === "streak" || m === "oily") return m;
  return "soft";
}

export default function drawSmudge(ctx: Ctx2D, opt: RenderOptions): void {
  const mode = pickMode(opt);
  switch (mode) {
    case "streak":
      drawSmudgeStreak(ctx, opt);
      break;
    case "oily":
      drawSmudgeOily(ctx, opt);
      break;
    default:
      drawSmudgeSoft(ctx, opt);
      break;
  }
}
