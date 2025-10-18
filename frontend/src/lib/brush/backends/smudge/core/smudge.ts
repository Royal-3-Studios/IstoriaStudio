// FILE: src/lib/brush/backends/smudge/core/smudge.ts
import type {
  RenderOptions,
  RenderOverrides,
  EngineStrokePath,
  RenderPathPoint,
} from "@/lib/brush/engine.types";
import type { CanvasLike } from "@/lib/brush/backends/utils/canvas";
import type { SmudgeOptions, DrawSmudgeToCanvas } from "../types";

/* --------------------------------- utils ---------------------------------- */

function must<T>(v: T | null | undefined, label: string): T {
  if (v == null) throw new Error(`smudge: ${label} is undefined`);
  return v;
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const asNum = (v: unknown, d: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : d;

const pressureOf = (pt: { p?: number; pressure?: number }): number =>
  typeof pt.p === "number"
    ? pt.p
    : typeof pt.pressure === "number"
      ? pt.pressure
      : 1;

const hypot2 = (dx: number, dy: number) => Math.hypot(dx, dy);

function toPoints(
  path: EngineStrokePath | Iterable<RenderPathPoint>
): RenderPathPoint[] {
  return Array.isArray(path)
    ? (path as unknown as RenderPathPoint[])
    : Array.from(path as Iterable<RenderPathPoint>);
}

function getCtx(surface: CanvasLike): CanvasRenderingContext2D {
  const ctx = (surface as HTMLCanvasElement).getContext("2d");
  return must(ctx as CanvasRenderingContext2D | null, "2D context");
}

function leftNormal(dx: number, dy: number): { nx: number; ny: number } {
  const len = hypot2(dx, dy);
  return len > 1e-6 ? { nx: -dy / len, ny: dx / len } : { nx: 0, ny: 0 };
}

/** Tiny deterministic RNG. */
function makeRng(seed: number): () => number {
  let t = seed >>> 0 || 1;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Make a canvas (OffscreenCanvas when available). */
function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function get2DStrict(
  surf: HTMLCanvasElement | OffscreenCanvas,
  opts?: CanvasRenderingContext2DSettings
): CanvasRenderingContext2D {
  const ctx = (surf as any).getContext("2d", opts);
  return must(ctx as CanvasRenderingContext2D | null, "2D context");
}

/* ---------------------------------- core ---------------------------------- */

/**
 * Sample-and-blend smudge:
 * - Samples a patch around the cursor (bilinear via drawImage).
 * - Optional perpendicular scatter (normal jitter).
 * - “Dirty tip” accumulation with mild evaporation.
 * - Strength + flow + opacity control the laydown.
 */
export const drawSmudgeToCanvas: DrawSmudgeToCanvas = (
  surface: CanvasLike,
  path: EngineStrokePath | Iterable<RenderPathPoint>,
  options: RenderOptions & { smudge: SmudgeOptions },
  _overrides?: RenderOverrides
) => {
  const ctx = getCtx(surface);
  const pts = toPoints(path);
  const n = pts.length;
  if (n === 0) return;

  // ---- Resolve engine overrides (composite, flow, opacity) -----------------
  const ov = options.engine.overrides ?? {};
  const composite: GlobalCompositeOperation =
    ((ov as Record<string, unknown>).composite as GlobalCompositeOperation) ??
    options.engine.rendering?.blendMode ??
    "source-over";
  const flow01 = clamp01(asNum(ov.flow, 100) / 100);
  const opacity01 = clamp01(asNum(ov.opacity, 100) / 100);

  // ---- Smudge options (concrete numbers) -----------------------------------
  const baseSizePx = asNum(
    options.smudge.baseSizePx,
    asNum((options as any).baseSizePx, 18)
  );
  const strength01 = clamp01(asNum(options.smudge.strengthPct, 70) / 100);
  const scatterPx = Math.max(0, asNum(options.smudge.scatterPx, 0));
  const minStepMs = Math.max(1, asNum(options.smudge.minStepMs, 8));
  const dirtyKeep01 = clamp01(asNum(options.smudge.dirtyAmountPct, 60) / 100);
  const dirtyEvap01 = clamp01(asNum(options.smudge.dirtyEvapPct, 15) / 100);
  const softenPx = Math.max(0, asNum(options.smudge.softenPx, 0));

  // ---- Paint setup ----------------------------------------------------------
  ctx.save();
  ctx.globalCompositeOperation = composite;

  // Deterministic jitter
  const rng = makeRng(asNum(options.seed, 0));

  // ---- Dirty tip sprite (accumulated pigment) ------------------------------
  // Internal resolution slightly larger than max stamp size for quality.
  const tipRes = Math.max(32, Math.ceil(baseSizePx * 2));
  const tipSurf = makeCanvas(tipRes, tipRes);
  const tipCtx = get2DStrict(tipSurf, { willReadFrequently: true });
  tipCtx.clearRect(0, 0, tipRes, tipRes);

  // Optional softening while drawing into tip
  const pushTipBlur = () => {
    if (softenPx > 0) tipCtx.filter = `blur(${softenPx}px)`;
  };
  const popTipBlur = () => {
    if (softenPx > 0) tipCtx.filter = "none";
  };

  // Mix a newly sampled patch into the tip (with evaporation + keep)
  function mixIntoTip(
    src: HTMLCanvasElement | OffscreenCanvas,
    alpha01: number
  ) {
    // Evaporate
    if (dirtyEvap01 > 0) {
      tipCtx.globalCompositeOperation = "destination-in";
      tipCtx.globalAlpha = Math.max(0, 1 - dirtyEvap01);
      tipCtx.drawImage(tipSurf as any, 0, 0);
    }

    // Add new sample
    tipCtx.globalCompositeOperation = "source-over";
    tipCtx.globalAlpha = clamp01(alpha01);
    pushTipBlur();
    tipCtx.drawImage(src as any, 0, 0, tipRes, tipRes);
    popTipBlur();

    // Keep a portion of the old tip underneath
    if (dirtyKeep01 > 0 && dirtyKeep01 < 1) {
      tipCtx.globalCompositeOperation = "destination-over";
      tipCtx.globalAlpha = dirtyKeep01;
      tipCtx.drawImage(tipSurf as any, 0, 0);
    }

    // Reset
    tipCtx.globalAlpha = 1;
    tipCtx.globalCompositeOperation = "source-over";
  }

  // Temporary sampling surface
  const tempSurf = makeCanvas(1, 1);
  const tmpCtx = get2DStrict(tempSurf, { willReadFrequently: true });

  // Copy a square patch from main canvas around (sx,sy)
  function samplePatchToTemp(sx: number, sy: number, sizePx: number) {
    const half = sizePx * 0.5;
    const srcX = Math.round(sx - half);
    const srcY = Math.round(sy - half);
    const srcW = Math.max(1, Math.round(sizePx));
    const srcH = Math.max(1, Math.round(sizePx));
    // Resize temp to match patch size to keep good resampling quality
    (tempSurf as any).width = srcW;
    (tempSurf as any).height = srcH;
    tmpCtx.clearRect(0, 0, srcW, srcH);
    // Bilinear draw from main canvas
    tmpCtx.drawImage(
      ctx.canvas as HTMLCanvasElement,
      srcX,
      srcY,
      srcW,
      srcH,
      0,
      0,
      srcW,
      srcH
    );
  }

  // Stamp the current tip onto main canvas
  function stampTipAt(x: number, y: number, sizePx: number, alpha01: number) {
    if (alpha01 <= 0.0005) return;
    const half = sizePx * 0.5;
    ctx.globalAlpha = clamp01(alpha01 * flow01 * opacity01);
    ctx.drawImage(
      tipSurf as any,
      Math.round(x - half),
      Math.round(y - half),
      Math.round(sizePx),
      Math.round(sizePx)
    );
    ctx.globalAlpha = 1;
  }

  // Synthetic dt if timestamps are missing
  const dtAt = (i: number): number => {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    return typeof a.t === "number" && typeof b.t === "number"
      ? Math.max(1, b.t - a.t)
      : 16; // ~60 Hz
  };

  // ---- Main integration along the path -------------------------------------
  let prev = pts[0]!;
  for (let i = 1; i < n; i++) {
    const cur = pts[i]!;
    const dtMs = dtAt(i);

    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    const steps = Math.max(1, Math.round(dtMs / minStepMs));
    const stepx = dx / steps;
    const stepy = dy / steps;

    const { nx, ny } = leftNormal(dx, dy);

    for (let s = 1; s <= steps; s++) {
      const x = prev.x + stepx * s;
      const y = prev.y + stepy * s;

      // Size: mild pressure response (keeps edges soft but reactive)
      const pNow = clamp01(pressureOf(cur));
      const sizePx = Math.max(2, baseSizePx * (0.5 + 0.5 * pNow));

      // Perp jitter of sampling point
      const jitter = scatterPx > 0 ? (rng() * 2 - 1) * scatterPx : 0;
      const sx = x + nx * jitter;
      const sy = y + ny * jitter;

      // 1) Sample patch from main canvas → temp
      samplePatchToTemp(sx, sy, sizePx);

      // 2) Mix into dirty tip (alpha scales with strength & pressure)
      const mixAlpha = strength01 * (0.5 + 0.5 * pNow);
      mixIntoTip(tempSurf, mixAlpha);

      // 3) Stamp tip back to canvas at (x,y)
      stampTipAt(x, y, sizePx, strength01);
    }

    prev = cur;
  }

  ctx.restore();
};

export default drawSmudgeToCanvas;
