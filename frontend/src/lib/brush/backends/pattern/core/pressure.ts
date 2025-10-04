// FILE: src/lib/brush/backends/pattern/core/pressure.ts

import type { RenderOptions } from "@/lib/brush/engine";
import type { PressureMapOpts } from "@/lib/brush/core/pressure";

/* Narrow, local shapes we care about */
type PressureCurveGamma = { type: "gamma"; gamma: number };
type PressureClamp = { min?: number };
type InputPressureCfg = { curve?: unknown; clamp?: unknown };
type InputCfg = { pressure?: unknown };

/* Type guards */
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function isGammaCurve(v: unknown): v is PressureCurveGamma {
  return isObj(v) && v.type === "gamma" && typeof v.gamma === "number";
}
function isClamp(v: unknown): v is PressureClamp {
  return isObj(v) && (v.min === undefined || typeof v.min === "number");
}

/** Build a PressureMapOpts from RenderOptions.input (if present), without using `any`. */
export function buildPressureMap(
  opt: RenderOptions
): PressureMapOpts | undefined {
  const maybeInput: unknown = (opt as { input?: unknown }).input;
  if (!isObj(maybeInput)) return undefined;

  const input = maybeInput as InputCfg;
  if (!isObj(input.pressure)) return undefined;

  const p = input.pressure as InputPressureCfg;

  let gamma: number | undefined;
  let deadZone: number | undefined;

  if (isGammaCurve(p.curve)) {
    gamma = p.curve.gamma;
  }

  if (isClamp(p.clamp) && typeof p.clamp.min === "number") {
    // clamp into [0, 0.5]
    deadZone = Math.max(0, Math.min(0.5, p.clamp.min));
  }

  // Return undefined if nothing was discovered; otherwise include only defined keys
  const out: Partial<PressureMapOpts> = {};
  if (gamma !== undefined) out.gamma = gamma;
  if (deadZone !== undefined) out.deadZone = deadZone;

  return Object.keys(out).length > 0 ? (out as PressureMapOpts) : undefined;
}
