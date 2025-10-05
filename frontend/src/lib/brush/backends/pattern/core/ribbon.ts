// FILE: src/lib/brush/backends/pattern/core/ribbon.ts

import type { RenderOptions, RenderPathPoint } from "@/lib/brush/engine";
import {
  resamplePath as engineResamplePath,
  resolveSpacingFraction,
} from "@backends/utils/stroke";
import type { SamplePoint } from "@backends/utils/stroke";

/** Resample with simple angle estimation (centered diff). */
export type SampleWithAngle = SamplePoint & { ang: number };

export function resampleWithAngle(
  pts: ReadonlyArray<RenderPathPoint>,
  stepPx: number
): SampleWithAngle[] {
  const base = engineResamplePath(pts, stepPx);
  const n = base.length;
  if (n === 0) return [];
  const out: SampleWithAngle[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = base[Math.max(0, i - 1)]!;
    const b = base[Math.min(n - 1, i + 1)]!;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    out[i] = { ...base[i]!, ang };
  }
  return out;
}

export function buildRibbonOutline(
  samples: ReadonlyArray<SampleWithAngle>,
  radiusAt: (u: number) => number
): Path2D {
  const left: Array<{ x: number; y: number }> = [];
  const right: Array<{ x: number; y: number }> = [];
  const n = samples.length;
  for (let i = 0; i < n; i++) {
    const aPrev = i > 0 ? samples[i - 1]!.ang : samples[i]!.ang;
    const aNext = i < n - 1 ? samples[i + 1]!.ang : samples[i]!.ang;
    const ang = (aPrev + aNext) * 0.5;
    const nx = -Math.sin(ang),
      ny = Math.cos(ang);
    const r = Math.max(0, radiusAt(samples[i]!.t));
    left.push({ x: samples[i]!.x - nx * r, y: samples[i]!.y - ny * r });
    right.push({ x: samples[i]!.x + nx * r, y: samples[i]!.y + ny * r });
  }
  const path = new Path2D();
  path.moveTo(left[0]!.x, left[0]!.y);
  for (let i = 1; i < n; i++) path.lineTo(left[i]!.x, left[i]!.y);
  for (let i = n - 1; i >= 0; i--) path.lineTo(right[i]!.x, right[i]!.y);
  path.closePath();
  return path;
}

export function spacingToStepPx(opt: RenderOptions): number {
  const ui =
    opt.engine.strokePath?.spacing ?? opt.engine.overrides?.spacing ?? 6;
  const frac = resolveSpacingFraction(ui as number, 6);
  const baseR = Math.max(0.5, (opt.baseSizePx ?? 8) * 0.5);
  return Math.max(0.45, Math.min(2.2, baseR * frac));
}
