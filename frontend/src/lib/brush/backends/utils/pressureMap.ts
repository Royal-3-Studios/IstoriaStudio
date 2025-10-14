// Build a PressureMapOpts from RenderOptions.input (type-safe, no `any`).

import type { RenderOptions } from "@/lib/brush/engine.types";
import type { PressureMapOpts } from "@/lib/brush/core/pressure";

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
type PressureCurveGamma = { type: "gamma"; gamma: number };
type PressureClampMin = { min?: number };

function isGammaCurve(v: unknown): v is PressureCurveGamma {
  return isObj(v) && v.type === "gamma" && typeof v.gamma === "number";
}
function isClampMin(v: unknown): v is PressureClampMin {
  return isObj(v) && (v.min === undefined || typeof v.min === "number");
}

/** Extracts { deadZone?, gamma? } from opt.input.pressure.{clamp,curve} */
export function pressureMapFromRenderOptions(
  opt: RenderOptions
): PressureMapOpts | undefined {
  const input = (opt as { input?: unknown }).input;
  if (!isObj(input)) return undefined;
  const p = (input as { pressure?: unknown }).pressure;
  if (!isObj(p)) return undefined;

  let gamma: number | undefined;
  let deadZone: number | undefined;

  if (isGammaCurve((p as { curve?: unknown }).curve)) {
    gamma = (p as { curve: PressureCurveGamma }).curve.gamma;
  }
  if (isClampMin((p as { clamp?: unknown }).clamp)) {
    const min = (p as { clamp: PressureClampMin }).clamp?.min;
    if (typeof min === "number") deadZone = Math.max(0, Math.min(0.5, min));
  }

  if (gamma === undefined && deadZone === undefined) return undefined;
  const out: Partial<PressureMapOpts> = {};
  if (gamma !== undefined) out.gamma = gamma;
  if (deadZone !== undefined) out.deadZone = deadZone;
  return out as PressureMapOpts;
}
