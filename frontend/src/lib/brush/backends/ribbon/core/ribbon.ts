// FILE: src/lib/brush/backends/ribbon/core/ribbon.ts

import type {
  RenderOptions,
  RenderOverrides,
  EngineStrokePath,
  RenderPathPoint,
} from "@/lib/brush/engine.types";
import {
  toOutlineSamples,
  buildRibbonOutline,
  withRibbonClip,
} from "./outline";

import type { CanvasLike } from "@backends/utils/canvas";
import { get2D } from "@backends/utils/canvas";

import { streamlinePath } from "./streamline";
import { resampleBySpacing } from "./resample";
import type { RibbonOptions, RibbonTip, DrawRibbonToCanvas } from "../types";
import { evaluateCurve, DefaultCurves } from "@/lib/brush/curves";

/* --------------------------------- utilities -------------------------------- */

function must<T>(v: T | undefined | null, label: string): T {
  if (v === undefined || v === null)
    throw new Error(`Ribbon: ${label} is undefined`);
  return v;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

const numberOr = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

/** Compute speed between two samples (px/s), using timestamps if available. */
function speedPxPerSec(
  a: RenderPathPoint,
  b: RenderPathPoint,
  fallbackDtMs = 16
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distancePx = Math.hypot(dx, dy);
  let dtMs = fallbackDtMs;
  if (typeof a.t === "number" && typeof b.t === "number") {
    dtMs = Math.max(1, b.t - a.t);
  }
  return distancePx / (dtMs / 1000);
}

/** Resolve a numeric size from options/overrides with safe defaults. */
function resolveBaseDiameterPx(
  options: RenderOptions,
  overrides?: RenderOverrides
): number {
  const ovr = overrides as unknown as { sizePx?: number } | undefined;
  const opt = options as unknown as { sizePx?: number } | undefined;
  return numberOr(ovr?.sizePx, numberOr(opt?.sizePx, 12));
}

/** Resolve global flow/opacity [0..100] → [0..1] */
function resolveGlobalFlowMultiplier(options: RenderOptions): number {
  const overrideFlowPct = (options.engine?.overrides as any)?.flow as
    | number
    | undefined;
  const renderFlowPct = options.engine?.rendering?.flow;
  const flowPct = numberOr(overrideFlowPct, numberOr(renderFlowPct, 100));
  return clamp01(flowPct / 100);
}

/** Resolve global composite operation */
function resolveCompositeOperation(
  options: RenderOptions
): GlobalCompositeOperation {
  const ovComposite = (options.engine?.overrides as any)?.composite as
    | GlobalCompositeOperation
    | undefined;
  return ovComposite ?? options.engine?.rendering?.blendMode ?? "source-over";
}

/* ----------------------------- tip normalization ----------------------------- */

type CachedTip = {
  kind: "sprite";
  image: CanvasImageSource;
  sizeScale: number; // multiply computed width
  softness: number; // advisory; kept for parity
};

function normalizeTip(tip?: RibbonTip): CachedTip | { kind: "round" } {
  if (!tip || tip.kind === "round") return { kind: "round" };
  return {
    kind: "sprite",
    image: tip.image,
    sizeScale: numberOr(tip.sizeScale, 1),
    softness: numberOr(tip.softness, 100),
  };
}

/* -------------------------------- renderer --------------------------------- */

/**
 * Draw a silky, tightly-spaced ribbon onto a canvas surface.
 * - Applies EMA streamline (0..100)
 * - Resamples by pixel spacing (+ jitter)
 * - Stamps round or sprite tips with per-segment width & flow
 * - Uses optional pressure/speed curves (engine.overrides)
 * - (Optional) Outline mode: set engine.overrides.ribbonOutline = true
 */
export const drawRibbonToCanvas: DrawRibbonToCanvas = (
  surface: CanvasLike,
  path: EngineStrokePath | Iterable<RenderPathPoint>,
  options: RenderOptions & { strokePath: RibbonOptions },
  overrides?: RenderOverrides
) => {
  const ctx = get2D(surface);

  // ---- Resolve stroke controls ------------------------------------------------
  const stroke = options.strokePath;
  const spacingPx = Math.max(0.1, stroke.spacing);
  const jitterPx = Math.max(0, numberOr(stroke.jitter, 0) * spacingPx); // jitter 0..1 → px
  const streamlinePct = Math.min(
    Math.max(numberOr(stroke.streamline, 0), 0),
    100
  );

  const baseDiameterPx = resolveBaseDiameterPx(options, overrides);
  const globalFlowMul = resolveGlobalFlowMultiplier(options); // 0..1
  const composite = resolveCompositeOperation(options);
  const color = (options.color as string | undefined) ?? "#000000";

  const tip = normalizeTip(stroke.tip);

  // Curve hooks from overrides (all optional; fallback to simple defaults)
  const ov = options.engine?.overrides ?? {};
  const pressureToWidthCurve =
    (ov as any).pressureToWidthCurve ??
    ([
      { x: 0, y: 0.25 },
      { x: 1, y: 1 },
    ] as const);
  const pressureToFlowCurve =
    (ov as any).pressureToFlowCurve ??
    ([
      { x: 0, y: 0.35 },
      { x: 1, y: 1 },
    ] as const);
  const speedToFlowCurve =
    (ov as any).speedToFlowCurve ?? DefaultCurves.easeInOut;
  const speedNormRef = numberOr((ov as any).speedNormRefPxPerSec, 1000); // px/s

  // Evaluators
  const widthFromPressure = (p: number) =>
    evaluateCurve(pressureToWidthCurve, clamp01(p));
  const flowFromPressure = (p: number) =>
    evaluateCurve(pressureToFlowCurve, clamp01(p));
  const flowFromSpeed = (speedPxPerSecond: number) =>
    evaluateCurve(
      speedToFlowCurve,
      clamp01(speedPxPerSecond / Math.max(1, speedNormRef))
    );

  // ---- 1) Smooth --------------------------------------------------------------
  // Accept either an EngineStrokePath (legacy type) or any Iterable<RenderPathPoint>.
  // streamlinePath already normalizes internally, but we give it the raw union.
  const smoothed: RenderPathPoint[] =
    streamlinePct > 0
      ? streamlinePath(path as any, streamlinePct)
      : Array.from(path as Iterable<RenderPathPoint>);

  // ---- 2) Resample ------------------------------------------------------------
  // Mild overlap (≈15%) reduces “railroad ties” with sprite tips. Use a slightly smaller step.
  const overlapFactor = 0.85; // 1.0 = butt-to-butt; <1 = overlapped
  const stepPx = spacingPx * overlapFactor;

  // Deterministic RNG hook (swap with mulberry32(seed) if you add seeding upstream)
  const rng = Math.random;
  const samples: RenderPathPoint[] = resampleBySpacing(
    smoothed,
    stepPx,
    jitterPx,
    rng
  );
  const sampleCount = samples.length;
  if (sampleCount === 0) return;

  // ---- 3) Canvas state --------------------------------------------------------
  ctx.save();
  ctx.globalCompositeOperation = composite;
  ctx.lineCap = stroke.cap ?? "round";
  ctx.lineJoin = "round";
  (ctx as CanvasRenderingContext2D).fillStyle = color;

  // ---- 3.5) Optional outline mode --------------------------------------------
  const wantOutline = !!(options.engine?.overrides as any)?.ribbonOutline;
  if (wantOutline) {
    const outlineSamples = toOutlineSamples(samples);
    const baseR = baseDiameterPx * 0.5;

    const outline = buildRibbonOutline(outlineSamples, (_arc, t) => {
      // gentle bell with tip fade
      const edge = Math.min(t, 1 - t);
      const endSoft = Math.pow(Math.min(1, edge / 0.42), 2.2);
      return Math.max(0.5, baseR * (0.85 + 0.15 * endSoft));
    });

    withRibbonClip(ctx, outline, () => {
      ctx.globalAlpha = globalFlowMul;
      ctx.fillStyle = color;
      ctx.fill(outline);
    });

    ctx.restore();
    return; // skip stamp loop when using outline mode
  }

  // ---- 4) Stamp along the path ------------------------------------------------
  if (tip.kind === "round") {
    // Fast analytic round stamps
    for (let i = 0; i < sampleCount; i++) {
      const curr = samples[i]!;
      const prev = samples[i - 1] ?? curr;

      const pressure =
        typeof (curr as any).p === "number"
          ? (curr as any).p
          : typeof curr.pressure === "number"
            ? curr.pressure
            : 1;

      const widthPx = baseDiameterPx * widthFromPressure(pressure);
      const speedNow = speedPxPerSec(prev, curr); // px/s
      const alphaMul =
        globalFlowMul * flowFromPressure(pressure) * flowFromSpeed(speedNow);

      if (widthPx <= 0.01 || alphaMul <= 0.001) continue;

      ctx.globalAlpha = alphaMul;

      const radius = widthPx * 0.5;
      ctx.beginPath();
      ctx.arc(curr.x, curr.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Sprite tip: drawImage with size scaled by width; centered at sample point
    const img = tip.image;
    for (let i = 0; i < sampleCount; i++) {
      const curr = samples[i]!;
      const prev = samples[i - 1] ?? curr;

      const pressure =
        typeof (curr as any).p === "number"
          ? (curr as any).p
          : typeof curr.pressure === "number"
            ? curr.pressure
            : 1;

      const widthPx =
        baseDiameterPx * tip.sizeScale * widthFromPressure(pressure);
      const speedNow = speedPxPerSec(prev, curr);
      const alphaMul =
        globalFlowMul * flowFromPressure(pressure) * flowFromSpeed(speedNow);

      if (widthPx <= 0.01 || alphaMul <= 0.001) continue;

      ctx.globalAlpha = alphaMul;

      const halfWidth = widthPx * 0.5;
      ctx.drawImage(
        img,
        curr.x - halfWidth,
        curr.y - halfWidth,
        widthPx,
        widthPx
      );
    }
  }

  ctx.restore();
};

export default drawRibbonToCanvas;
