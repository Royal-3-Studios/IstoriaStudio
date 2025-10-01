// ========================
// FILE: src/lib/brush/backends/stamping/inputMaps.ts
// ========================
import type { BrushInputConfig } from "@/data/brushPresets";
import type { PressureMapOpts } from "./types";

const DEFAULT_PRESSURE_MAP: PressureMapOpts = {
  gamma: 1,
  deadZone: 0,
  gain: 1,
};
export const DEFAULT_INPUT_QUALITY = {
  predictPx: 0,
  speedToSpacing: 0,
  minStepPx: 0.1,
} as const;

export function toPressureMapFromInput(
  input?: BrushInputConfig
): PressureMapOpts {
  if (!input) return DEFAULT_PRESSURE_MAP;
  const gamma =
    input.pressure.curve?.type === "gamma"
      ? input.pressure.curve.gamma
      : undefined;
  const deadZone =
    typeof input.pressure.clamp?.min === "number"
      ? Math.max(0, Math.min(0.5, input.pressure.clamp.min))
      : undefined;
  type MaybeGain = { gain?: number };
  const maybeGain: MaybeGain | undefined = (input as { pressure?: MaybeGain })
    .pressure;
  const gain = typeof maybeGain?.gain === "number" ? maybeGain.gain : undefined;
  const out: Partial<PressureMapOpts> = {};
  if (gamma !== undefined) out.gamma = gamma;
  if (deadZone !== undefined) out.deadZone = deadZone;
  if (gain !== undefined) out.gain = gain;
  return (
    Object.keys(out).length ? out : DEFAULT_PRESSURE_MAP
  ) as PressureMapOpts;
}

export type InputQualityOpts = {
  predictPx: number;
  speedToSpacing: number;
  minStepPx: number;
};
export function toInputQualityFromInput(
  input?: BrushInputConfig
): InputQualityOpts {
  if (!input) return { ...DEFAULT_INPUT_QUALITY };
  const predictPx = input.quality?.predictPx;
  const speedToSpacing = input.quality?.speedToSpacing;
  const minStepPx = input.quality?.minStepPx;
  const out: Partial<InputQualityOpts> = {};
  if (typeof predictPx === "number") out.predictPx = predictPx;
  if (typeof speedToSpacing === "number") out.speedToSpacing = speedToSpacing;
  if (typeof minStepPx === "number") out.minStepPx = minStepPx;
  return (
    Object.keys(out).length ? out : { ...DEFAULT_INPUT_QUALITY }
  ) as InputQualityOpts;
}
