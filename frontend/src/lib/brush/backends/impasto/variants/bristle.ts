// FILE: src/lib/brush/backends/impasto/variants/bristle.ts
import type {
  RenderOptions,
  RenderOverrides,
  ImpastoOverrides,
} from "@/lib/brush/engine.types";
import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer, get2D } from "@backends/utils/canvas";
import * as Blend from "@backends/utils/blending";
import { drawHeightStamps, blurLayerInPlace } from "../core/heightfield";
import { shadeFromHeightAlpha } from "../core/lighting";
import { pigmentFrom, applyShading, applySpecular } from "../core/paint-merge";
import {
  pressureToRadius,
  pressureToAlpha,
  jitterAmount,
} from "../core/bristle-model";
import { resample, resolveSpacingFraction, seededRng } from "./_common";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** Bristle: micro-jittery bristle footprint with height shading + optional spec.
 *  Tilt routing:
 *   - tilt→fan: widens footprint across the normal (bristle “splay”)
 *   - tilt→depth: biases height/alpha a bit higher to emphasize grooves
 *  We reuse generic overrides:
 *   - tiltToFan (0..1): drives fan and depth bias (subtle)
 *   - (optionally) tiltToSize (0..1): small overall size boost with tilt
 */
export function drawImpastoBristle(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  if (pts.length < 2) return;

  const w = Math.max(1, Math.floor(opt.width));
  const h = Math.max(1, Math.floor(opt.height));
  const baseSizePx = Math.max(1, opt.baseSizePx || 12);
  const color = opt.color ?? "#000000";

  // Cross-backend overrides (spacing/tilt knobs)
  const ov = (opt.engine.overrides ?? {}) as Partial<RenderOverrides>;
  // Backend-specific impasto knobs
  const imp: ImpastoOverrides = (opt.engine.backendOverrides?.impasto ??
    {}) as ImpastoOverrides;

  // Spacing → step
  const spacingUI =
    opt.engine.strokePath?.spacing ??
    (isNum(ov.spacing) ? ov.spacing : undefined) ??
    6;
  const spacingFrac = resolveSpacingFraction(spacingUI, 6);
  const stepPx = Math.max(0.5, Math.min(2.2, baseSizePx * spacingFrac));

  const samples = resample(pts, stepPx, opt.input);
  if (samples.length < 2) return;

  // ── Tilt routing ───────────────────────────────────────────────────────────
  const tiltToFan = ov.tiltToFan ?? 0; // drives splay + depth bias
  const tiltToSize = ov.tiltToSize ?? 0; // optional gentle size boost

  // Average tilt across incoming points (stable & cheap)
  const tilts: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const t = (pts[i] as { tilt?: number }).tilt;
    if (isNum(t)) tilts.push(clamp01(t));
  }
  const avgTilt01 = tilts.length
    ? tilts.reduce((a, b) => a + b, 0) / tilts.length
    : 0;

  // Fan factor: >1 widens across the stroke normal
  const fan = 1 + clamp01(tiltToFan) * avgTilt01;
  // Depth bias: subtle height/alpha boost with tilt (kept gentle to avoid plastic look)
  const depthMul = 1 + 0.35 * clamp01(tiltToFan) * avgTilt01;
  // Optional overall size boost
  const sizeMul = 1 + clamp01(tiltToSize) * avgTilt01;

  const rng = seededRng(opt);

  // Build height stamps with slight normal-direction jitter per segment
  // If drawHeightStamps supports { rx, ry, angle }, these will render elliptical swipes.
  // If not, it will read `radius` only and still work (you’ll still get depth bias).
  const stamps = samples.slice(1).map((b, i) => {
    const a = samples[i]!;
    const pMid = (a.p + b.p) * 0.5;

    // Baseline radius & alpha from pressure
    const rBase = pressureToRadius(pMid, {
      baseSizePx: baseSizePx * sizeMul,
      jitterPx: 0.2,
    });
    const alphaBase = pressureToAlpha(pMid, { baseSizePx });

    // Stroke unit normal from tangent angle
    const nx = -Math.sin(b.ang);
    const ny = Math.cos(b.ang);

    // Bristle “fan”: widen jitter in the normal direction with tilt
    const j = jitterAmount(0.15 * fan, rng);

    // Elliptical footprint aligned to stroke:
    const rx = Math.max(0.5, rBase * fan); // across normal (wider with tilt)
    const ry = Math.max(0.4, rBase / Math.max(1e-6, fan)); // along tangent (tighter with tilt)
    const angle = b.ang; // align ellipse with stroke

    // Depth bias via alpha (height proxy)
    const alpha = Math.min(1, alphaBase * depthMul);

    return {
      // legacy fields (always present)
      ax: a.x + nx * j,
      ay: a.y + ny * j,
      bx: b.x + nx * j,
      by: b.y + ny * j,
      radius: rBase, // kept for legacy drawHeightStamps

      // richer ellipse fields (preferred if supported by drawHeightStamps)
      rx,
      ry,
      angle,

      alpha,
      color,
    };
  });

  // Height field (alpha is height)
  const heightLayer = drawHeightStamps(w, h, stamps);
  blurLayerInPlace(heightLayer, Math.max(0, imp.heightBlurPx ?? 0.6));

  // Shade from height (Sobel normals → Lambert)
  const hctx: Ctx2D = get2D(heightLayer);
  const heightImg = (hctx as CanvasRenderingContext2D).getImageData(0, 0, w, h);

  const az = ((imp.lightAzimuthDeg ?? 35) * Math.PI) / 180;
  const el = ((imp.lightElevationDeg ?? 55) * Math.PI) / 180;
  const L = {
    x: Math.cos(el) * Math.cos(az),
    y: Math.cos(el) * Math.sin(az),
    z: Math.sin(el),
  };

  const reliefIntensity = Math.max(0.1, imp.reliefIntensity ?? 1.5);
  const ambient = Math.max(0, Math.min(1, imp.ambient ?? 0.25));
  const shadeImg = shadeFromHeightAlpha(
    heightImg,
    w,
    h,
    L,
    reliefIntensity,
    ambient
  );

  const shadeCanvas = createLayer(w, h);
  const scx: Ctx2D = get2D(shadeCanvas);
  (scx as CanvasRenderingContext2D).putImageData(shadeImg, 0, 0);

  // Pigment from height + shading
  const pigment = pigmentFrom(heightLayer, color);
  applyShading(pigment, shadeCanvas);

  // Optional specular from shade
  const specAmt = Math.max(0, Math.min(1, imp.specAmount ?? 0.18));
  const specFromShade = Math.max(0, Math.min(1, imp.specFromShade ?? 1));
  applySpecular(pigment, shadeCanvas, specAmt, specFromShade);

  // Composite to destination
  Blend.withComposite(ctx, "source-over", () => {
    ctx.drawImage(pigment as unknown as CanvasImageSource, 0, 0);
  });
}
