// FILE: src/lib/brush/backends/spray/core/spray.ts
import type {
  RenderOptions,
  RenderOverrides,
  EngineStrokePath,
  RenderPathPoint,
} from "@/lib/brush/engine.types";
import type { CanvasLike } from "@/lib/brush/backends/utils/canvas";
import { makeGaussianSprite } from "./gaussian";
import type { SprayOptions, DrawSprayToCanvas } from "../types";

/* --------------------------------- helpers -------------------------------- */

function must<T>(v: T | undefined | null, label: string): T {
  if (v === undefined || v === null)
    throw new Error(`spray: ${label} is undefined`);
  return v;
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const num = (v: unknown, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;

const pressureOf = (pt: { p?: number; pressure?: number }): number =>
  typeof pt.p === "number"
    ? pt.p
    : typeof pt.pressure === "number"
      ? pt.pressure
      : 1;

const dist = (dx: number, dy: number) => Math.hypot(dx, dy);

type CurvePoint = { x: number; y: number };
type MaybeCurve = ReadonlyArray<CurvePoint> | undefined;

function sampleCurve01(curve: MaybeCurve, t: number): number {
  const T = clamp01(t);
  if (!curve || curve.length === 0) return T; // linear fallback
  let prev = curve[0]!;
  if (T <= prev.x) return clamp01(prev.y);
  for (let i = 1; i < curve.length; i++) {
    const next = curve[i]!;
    if (T <= next.x) {
      const u = (T - prev.x) / Math.max(1e-6, next.x - prev.x);
      return clamp01(prev.y + (next.y - prev.y) * u);
    }
    prev = next;
  }
  return clamp01(prev.y);
}

/** Simple seeded RNG (mulberry32). */
function makeRng(seed: number): () => number {
  let t = seed >>> 0 || 1;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Value-noise-ish 2D hash for alpha modulation. */
function noise2(hash: () => number, x: number, y: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  const f = s - Math.floor(s);
  return (f + hash()) * 0.5; // 0..1
}

function getCtx(surface: CanvasLike): CanvasRenderingContext2D {
  const ctx = (surface as HTMLCanvasElement).getContext("2d");
  return must(ctx as CanvasRenderingContext2D | null, "2D context");
}

function toPoints(
  path: EngineStrokePath | Iterable<RenderPathPoint>
): RenderPathPoint[] {
  // Accept legacy callers that might pass an EngineStrokePath by mistake.
  if (Array.isArray(path)) {
    return path as unknown as RenderPathPoint[];
  }
  return Array.from(path as Iterable<RenderPathPoint>);
}

/* ---------------------------------- core ---------------------------------- */

export const drawSprayToCanvas: DrawSprayToCanvas = (
  surface: CanvasLike,
  path: EngineStrokePath | Iterable<RenderPathPoint>,
  options: RenderOptions & { spray: SprayOptions },
  _overrides?: RenderOverrides
): void => {
  const ctx = getCtx(surface);
  const pts = toPoints(path);
  if (pts.length === 0) return;

  // ---- Resolve spray options (with sane defaults) --------------------------
  const sigmaPx = Math.max(0.5, options.spray.sigmaPx);
  const hardness = num(options.spray.hardness, 0);
  const hoverRate = num(options.spray.hoverRateAlphaPerSec, 1.0); // α/sec when stationary
  const moveRate = num(options.spray.moveRateAlphaPerPx, 0.04); // α/px when moving
  const minStepMs = Math.max(1, num(options.spray.minStepMs, 8));
  const spriteRes = Math.max(32, (options.spray.spriteResolution ?? 256) | 0);

  const noiseAmt = clamp01(num(options.spray.noiseAmount, 0));
  const noiseScale = Math.max(1, num(options.spray.noiseScalePx, 64));

  // ---- Global composite + flow/opacity from overrides ----------------------
  const ov = options.engine.overrides ?? {};
  const composite: GlobalCompositeOperation =
    ((ov as Record<string, unknown>).composite as GlobalCompositeOperation) ??
    options.engine.rendering?.blendMode ??
    "source-over";

  const baseFlow01 = clamp01(((ov.flow as number | undefined) ?? 100) / 100);
  const baseOpacity01 = clamp01(
    ((ov.opacity as number | undefined) ?? 100) / 100
  );

  // Optional curves: pressure→flow, speed→flow, pressure→size (width)
  const pressureToFlowCurve = (
    ov as unknown as {
      pressureToFlowCurve?: MaybeCurve;
    }
  ).pressureToFlowCurve;

  const speedToFlowCurve = (
    ov as unknown as {
      speedToFlowCurve?: MaybeCurve;
    }
  ).speedToFlowCurve;

  const pressureToWidthCurve = (
    ov as unknown as {
      pressureToWidthCurve?: MaybeCurve;
    }
  ).pressureToWidthCurve;

  const speedNormRefPxPerSec =
    (ov as unknown as { speedNormRefPxPerSec?: number }).speedNormRefPxPerSec ??
    1000;

  // ---- Sprite (Gaussian disk) ---------------------------------------------
  const sprite = makeGaussianSprite(spriteRes, sigmaPx, hardness);

  // ---- Paint setup ---------------------------------------------------------
  ctx.save();
  (ctx as CanvasRenderingContext2D).globalCompositeOperation = composite;
  (ctx as CanvasRenderingContext2D).fillStyle =
    typeof (options as unknown as { color?: string }).color === "string"
      ? (options as unknown as { color: string }).color
      : "#000";

  const seed = (options.seed ?? 0) | 0;
  const rng = makeRng(seed);

  // ---- Integration state ---------------------------------------------------
  let last = pts[0]!;
  const synthDt = (i: number): number => {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (typeof a.t === "number" && typeof b.t === "number") {
      return Math.max(1, b.t - a.t); // ms
    }
    return 16; // ~60fps fallback
  };

  // Draw one sprite
  const drawStamp = (x: number, y: number, alpha: number, sizePx: number) => {
    if (alpha <= 0.0005) return;
    const half = sizePx * 0.5;
    let a = clamp01(alpha) * baseFlow01;
    if (noiseAmt > 0) {
      const n = noise2(rng, x / noiseScale, y / noiseScale);
      a *= 1 - noiseAmt + noiseAmt * n;
    }
    ctx.globalAlpha = clamp01(a);
    ctx.drawImage(sprite.canvas, x - half, y - half, sizePx, sizePx);
  };

  // ---- Main loop -----------------------------------------------------------
  for (let i = 1; i < pts.length; i++) {
    const a = last;
    const b = pts[i]!;
    const dtMs = synthDt(i);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dPx = dist(dx, dy);
    const dtSec = dtMs / 1000;

    // Per-interval rates
    const hoverAlpha = hoverRate * dtSec; // time based
    const moveAlpha = moveRate * dPx; // distance based

    // Speed normalization (for curve)
    const speedPxPerSec = dPx / Math.max(1e-4, dtSec);
    const speedNorm = clamp01(
      speedPxPerSec / Math.max(1, speedNormRefPxPerSec)
    );

    // Distribute over sub-steps (time-based so density is per-time)
    const steps = Math.max(1, Math.round(dtMs / minStepMs));
    const subDx = dx / steps;
    const subDy = dy / steps;

    for (let s = 0; s < steps; s++) {
      const x = a.x + subDx * (s + 1);
      const y = a.y + subDy * (s + 1);

      // Pressure from the “current” end feels best for fades
      const pNow = clamp01(pressureOf(b));
      const pf = sampleCurve01(pressureToFlowCurve, pNow);
      const sf = sampleCurve01(speedToFlowCurve, speedNorm);

      // Optional: size warping by pressure curve (mild)
      const pw = sampleCurve01(pressureToWidthCurve, pNow);
      const sizePx = Math.max(
        2,
        (options.baseSizePx ?? 24) * (0.35 + 0.65 * pw)
      );

      // Alpha share for this sub-step: split the interval’s alpha evenly
      const alphaStep = (hoverAlpha + moveAlpha) / steps;

      drawStamp(x, y, alphaStep * pf * sf, sizePx);
    }

    last = b;
  }

  ctx.globalAlpha = baseOpacity01;
  ctx.restore();
};

export default drawSprayToCanvas;
