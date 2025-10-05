// FILE: src/lib/brush/backends/wet/utils/sampling.ts
import type { RenderPathPoint } from "@/lib/brush/engine.types";
import type { BrushInputConfig } from "@/data/brushPresets";
import {
  resamplePath as resampleBase,
  resolveSpacingFraction,
} from "@backends/utils/stroke";
import { mapPressure, type PressureMapOpts } from "@/lib/brush/core/pressure";

export { resolveSpacingFraction };

/** Convert preset input curve/clamp to a PressureMapOpts (or undefined if no-op). */
function toPressureMapFromInput(
  input?: BrushInputConfig
): PressureMapOpts | undefined {
  if (!input) return undefined;

  const gamma =
    input.pressure.curve?.type === "gamma"
      ? input.pressure.curve.gamma
      : undefined;

  const deadZone =
    typeof input.pressure.clamp?.min === "number"
      ? Math.max(0, Math.min(0.5, input.pressure.clamp.min))
      : undefined;

  const out: Partial<PressureMapOpts> = {};
  if (gamma !== undefined) out.gamma = gamma;
  if (deadZone !== undefined) out.deadZone = deadZone;

  return Object.keys(out).length ? (out as PressureMapOpts) : undefined;
}

/**
 * Resample path with arc-length step, compute tangent angle, and
 * apply pressure mapping from BrushInputConfig (if provided).
 */
export function resample(
  pts: ReadonlyArray<RenderPathPoint>,
  stepPx: number,
  input?: BrushInputConfig
): Array<{ x: number; y: number; t: number; p: number; ang: number }> {
  const base = resampleBase(pts, stepPx);
  if (base.length === 0) return [];

  const pmap = toPressureMapFromInput(input);

  const out: Array<{
    x: number;
    y: number;
    t: number;
    p: number;
    ang: number;
  }> = [];
  for (let i = 0; i < base.length; i++) {
    const a = i > 0 ? base[i - 1]! : base[i]!;
    const c = base[i]!;
    const b = i + 1 < base.length ? base[i + 1]! : base[i]!;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);

    // map pressure via preset curve/clamp if provided
    const p = pmap ? mapPressure(c.p, pmap) : c.p;

    out.push({ x: c.x, y: c.y, t: c.t, p, ang });
  }
  return out;
}
