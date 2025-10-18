// FILE: src/lib/brush/backends/stamping/core/width.ts
import type { CurvePoint } from "@/lib/brush/engine.types";
import { evaluateCurve, sampleCurve } from "@/lib/brush/curves";

export type TaperProfile =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "expo";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const num = (v: unknown, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : d;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function ease(profile: TaperProfile | undefined, t: number): number {
  const x = clamp01(t);
  switch (profile) {
    case "easeIn":
      return x * x;
    case "easeOut":
      return 1 - (1 - x) * (1 - x);
    case "easeInOut":
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case "expo":
      return x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, 10 * (x - 1));
    case "linear":
    default:
      return x;
  }
}

export type WidthOpts = {
  /** Nominal diameter in px (same unit as baseRadius*2) */
  baseSizePx: number;

  /** Minimum absolute width in px */
  tipMinPx?: number;

  /** 0..1 — 1 = perfectly uniform body */
  uniformity?: number;

  /** Bias taper toward end; positive pulls mass toward the tail */
  endBias?: number;

  /** Tip scale at start/end (0..1, 1 = full size) */
  tipScaleStart?: number;
  tipScaleEnd?: number;

  /** Taper profiles at start/end */
  taperProfileStart?: TaperProfile;
  taperProfileEnd?: TaperProfile;

  /** pressure (0..1) → width multiplier (0..1); points OR LUT (fast path) */
  pressureToWidthCurve?: ReadonlyArray<CurvePoint> | Float32Array;
};

/** Overloads: new 4-arg form, or legacy 5-arg form where tipMinPx is positional. */
export function widthPxFromScale(
  baseRadius: number,
  t01: number,
  pressure01: number,
  opts: WidthOpts
): number;
export function widthPxFromScale(
  baseRadius: number,
  t01: number,
  pressure01: number,
  opts: WidthOpts,
  tipMinPx: number
): number;

export function widthPxFromScale(
  baseRadius: number,
  t01: number,
  pressure01: number,
  opts: WidthOpts,
  legacyTipMinPx?: number
): number {
  const t = clamp01(t01);
  const baseSizePx = Math.max(1, num(opts.baseSizePx, baseRadius * 2));

  // --- Taper/body shaping ---
  const startScale = clamp01(num(opts.tipScaleStart, 0.85));
  const endScale = clamp01(num(opts.tipScaleEnd, 0.85));
  const startEase = ease(opts.taperProfileStart ?? "linear", 1 - t); // head
  const endEase = ease(opts.taperProfileEnd ?? "linear", t); // tail

  let shapeScale = Math.max(
    lerp(startScale, 1, 1 - startEase),
    lerp(endScale, 1, 1 - endEase)
  );

  const uniformity = clamp01(num(opts.uniformity, 0.8));
  shapeScale = lerp(shapeScale, 1, uniformity);

  const endBias = num(opts.endBias, 0);
  if (endBias !== 0) {
    const k = clamp01(0.5 + 0.5 * endBias);
    shapeScale = lerp(shapeScale, shapeScale * (0.9 + 0.2 * k), t);
  }

  // --- Pressure widening ---
  const p = clamp01(pressure01);
  let pressureMul: number;
  const src = opts.pressureToWidthCurve;
  if (src instanceof Float32Array) {
    pressureMul = sampleCurve(src, p, 0.35 + Math.pow(p, 0.65) * 0.45);
  } else if (Array.isArray(src)) {
    pressureMul = evaluateCurve(src, p);
  } else {
    pressureMul = 0.35 + Math.pow(p, 0.65) * 0.45; // fallback mapping
  }

  // --- Width with floor (support both new/old arg styles) ---
  const floorPx =
    Math.max(0, num(opts.tipMinPx, NaN)) || Math.max(0, num(legacyTipMinPx, 0));

  const widthPx = Math.max(floorPx, baseSizePx * shapeScale * pressureMul);
  return widthPx;
}
