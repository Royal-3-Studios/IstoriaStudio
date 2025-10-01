// FILE: src/lib/brush/backends/impasto/variants/_common.ts
import type { RenderOptions, RenderPathPoint } from "@/lib/brush/engine.types";
import { Stroke as StrokeUtil, Rand } from "@backends";
import type { BrushInputConfig } from "@/data/brushPresets";
import { mapPressure, type PressureMapOpts } from "@/lib/brush/core/pressure";

export type Sample = {
  x: number;
  y: number;
  t: number;
  p: number;
  ang: number;
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const get = <T>(a: readonly T[], i: number): T => a[i]!;
const atClamp = <T>(a: readonly T[], i: number): T =>
  i <= 0 ? a[0]! : i >= a.length - 1 ? a[a.length - 1]! : a[i]!;

function toPressureMapFromInput(
  input?: BrushInputConfig
): PressureMapOpts | undefined {
  if (!input) return undefined;
  const gamma =
    input.pressure.curve?.type === "gamma"
      ? input.pressure.curve.gamma
      : undefined;
  const dead =
    typeof input.pressure.clamp?.min === "number"
      ? Math.max(0, Math.min(0.5, input.pressure.clamp.min))
      : undefined;

  const out: Partial<PressureMapOpts> = {};
  if (gamma !== undefined) out.gamma = gamma;
  if (dead !== undefined) out.deadZone = dead;
  return Object.keys(out).length ? (out as PressureMapOpts) : undefined;
}

export function resolveSpacingFraction(
  uiSpacing?: number,
  fallbackPct = 6
): number {
  const raw = typeof uiSpacing === "number" ? uiSpacing : fallbackPct;
  const frac = raw > 1 ? raw / 100 : raw;
  return Math.max(0.02, Math.min(0.1, frac));
}

export function resample(
  pts: ReadonlyArray<RenderPathPoint>,
  stepPx: number,
  input?: BrushInputConfig
): Sample[] {
  const pmap = toPressureMapFromInput(input);
  if (StrokeUtil?.resamplePath) {
    const base = StrokeUtil.resamplePath(
      pts as RenderPathPoint[],
      stepPx
    ) as Array<{ x: number; y: number; t: number; p: number; angle?: number }>;
    const out: Sample[] = [];
    for (let i = 0; i < base.length; i++) {
      const a = atClamp(base, i - 1);
      const c = get(base, i);
      const b = atClamp(base, i + 1);
      const ang =
        typeof c.angle === "number"
          ? c.angle
          : Math.atan2(b.y - a.y, b.x - a.x);
      const p = clamp01(mapPressure(clamp01(c.p), pmap));
      out.push({ x: c.x, y: c.y, t: c.t, p, ang });
    }
    return out;
  }

  // simple local fallback
  const out: Sample[] = [];
  const n = pts.length;
  if (n < 2) return out;
  let total = 0;
  const seg: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const dx = pts[i]!.x - pts[i - 1]!.x;
    const dy = pts[i]!.y - pts[i - 1]!.y;
    const L = Math.hypot(dx, dy);
    seg[i] = L;
    total += L;
  }
  if (total <= 0) return out;
  const prefix = new Array(n).fill(0);
  for (let i = 1; i < n; i++) prefix[i] = prefix[i - 1]! + seg[i]!;

  const posAt = (sArc: number) => {
    const s = Math.max(0, Math.min(total, sArc));
    let idx = 1;
    while (idx < n && prefix[idx]! < s) idx++;
    const i0 = Math.min(n - 1, Math.max(1, idx));
    const s0 = prefix[i0 - 1]!;
    const L = seg[i0]!;
    const u = L > 0 ? (s - s0) / L : 0;
    const a = pts[i0 - 1]!,
      b = pts[i0]!;
    const x = a.x + (b.x - a.x) * u;
    const y = a.y + (b.y - a.y) * u;
    const ap = typeof a.pressure === "number" ? clamp01(a.pressure) : 0.7;
    const bp = typeof b.pressure === "number" ? clamp01(b.pressure) : 0.7;
    const p = clamp01(
      mapPressure(lerp(ap, bp, u), toPressureMapFromInput(input))
    );
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    return { x, y, p, ang };
  };

  const step = Math.max(0.5, Math.min(2.2, stepPx));
  for (let s = 0; s <= total; s += step) {
    const r = posAt(s);
    out.push({
      x: r.x,
      y: r.y,
      t: total > 0 ? s / total : 0,
      p: r.p,
      ang: r.ang,
    });
  }
  if (out.length && out[out.length - 1]!.t < 1) {
    const r = posAt(total);
    out.push({ x: r.x, y: r.y, t: 1, p: r.p, ang: r.ang });
  }
  return out;
}

export function seededRng(opt: RenderOptions) {
  const seed = (opt.seed ?? 4242) >>> 0;
  return Rand.mulberry32(seed);
}
