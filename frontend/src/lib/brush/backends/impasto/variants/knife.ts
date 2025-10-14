// FILE: src/lib/brush/backends/impasto/variants/knife.ts
import type {
  RenderOptions,
  ImpastoOverrides,
  RenderOverrides,
} from "@/lib/brush/engine.types";
import * as Blend from "@backends/utils/blending";
import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer, get2D } from "@backends/utils/canvas";

import { drawHeightStamps, blurLayerInPlace } from "../core/heightfield";
import { shadeFromHeightAlpha } from "../core/lighting";
import { pigmentFrom, applyShading, applySpecular } from "../core/paint-merge";
import { resample, resolveSpacingFraction } from "./_common";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/**
 * Knife: flatter, broader plate; angle/fan respond to tilt.
 */
export function drawImpastoKnife(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  if (pts.length < 2) return;

  const w = Math.max(1, Math.floor(opt.width));
  const h = Math.max(1, Math.floor(opt.height));
  const baseSizePx = Math.max(1, opt.baseSizePx || 14);
  const color = opt.color ?? "#000000";

  const ov = (opt.engine.overrides ?? {}) as Partial<RenderOverrides>;
  const imp: ImpastoOverrides = (opt.engine.backendOverrides?.impasto ??
    {}) as ImpastoOverrides;

  // Spacing / resampling
  const spacingUI =
    opt.engine.strokePath?.spacing ??
    (isNum(ov.spacing) ? ov.spacing : undefined) ??
    5;
  const spacingFrac = resolveSpacingFraction(spacingUI, 5);
  const stepPx = Math.max(0.4, Math.min(2.0, baseSizePx * spacingFrac));

  const samples = resample(pts, stepPx, opt.input);
  if (samples.length < 2) return;

  // --- Tilt routing ---------------------------------------------------------
  // We reuse generic overrides:
  //   - tiltToFan: 0..1 → anisotropy factor & rake bias strength
  const tiltToFan = ov.tiltToFan ?? 0;

  // Average tilt across incoming points (0..1)
  const tilts: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const t = (pts[i] as { tilt?: number }).tilt;
    if (isNum(t)) tilts.push(clamp01(t));
  }
  const avgTilt01 = tilts.length
    ? tilts.reduce((a, b) => a + b, 0) / tilts.length
    : 0;

  // Fan (ellipse anisotropy): >1 stretches along direction, tightens across it
  const fan = 1 + clamp01(tiltToFan) * avgTilt01;

  // Rake angle bias (a gentle constant bias feels stable for knife)
  const RAKE_MAX = Math.PI / 10; // ~18° cap
  const rakeBiasRad = RAKE_MAX * clamp01(tiltToFan) * avgTilt01;

  // Angle sensitivity to stroke direction (existing behavior)
  const angleGain = Math.max(0, Math.min(1, imp.knifeAngleGain ?? 0.25));

  // Build stamped “height” primitives
  // If your drawHeightStamps supports { rx, ry, angle }, it will render ellipses.
  // If not, it will ignore rx/ry/angle and still work (using radius).
  const stamps = samples.slice(1).map((b, i) => {
    const a = samples[i]!;
    const pMid = (a.p + b.p) * 0.5;

    // Stroke direction angle in radians (b.ang was produced by resample)
    // Add rake bias from tilt to orient the knife a bit toward the “rake”.
    const strokeAngle = b.ang + rakeBiasRad;

    // Baseline radius from pressure + angleGain (classic behavior)
    const dir = Math.abs(Math.cos(b.ang)); // 0 at 90°, 1 at 0°
    const baseRadius =
      baseSizePx *
      0.6 *
      (0.55 + 0.8 * Math.pow(pMid, 0.9)) *
      (1 + angleGain * dir);

    // Elliptical footprint via tilt-driven fan
    const rx = Math.max(0.75, baseRadius * fan);
    const ry = Math.max(0.5, baseRadius / Math.max(1e-6, fan));

    const alpha = 0.42 + 0.45 * Math.pow(pMid, 0.9);

    // Provide both legacy radius and new rx/ry/angle; legacy paths can ignore extras
    return {
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
      // legacy:
      radius: baseRadius,
      // new (preferred):
      rx,
      ry,
      angle: strokeAngle,
      alpha,
      color,
    };
  });

  // Height field synthesis
  const heightLayer = drawHeightStamps(w, h, stamps);
  blurLayerInPlace(heightLayer, 0.45);

  const hctx: Ctx2D = get2D(heightLayer);
  const heightImg = (hctx as CanvasRenderingContext2D).getImageData(0, 0, w, h);

  // Lighting from impasto overrides
  const az = ((imp.lightAzimuthDeg ?? 30) * Math.PI) / 180;
  const el = ((imp.lightElevationDeg ?? 60) * Math.PI) / 180;
  const L = {
    x: Math.cos(el) * Math.cos(az),
    y: Math.cos(el) * Math.sin(az),
    z: Math.sin(el),
  };

  const reliefIntensity = Math.max(0.1, imp.reliefIntensity ?? 1.2);
  const ambient = Math.max(0, Math.min(1, imp.ambient ?? 0.2));

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

  const pigment = pigmentFrom(heightLayer, color);
  applyShading(pigment, shadeCanvas);

  // Specular controls
  const specAmt = Math.max(0, Math.min(1, imp.specAmount ?? 0.28));
  const specFromShade = Math.max(0, Math.min(1, imp.specFromShade ?? 1));
  applySpecular(pigment, shadeCanvas, specAmt, specFromShade);

  Blend.withComposite(ctx, "source-over", () => {
    ctx.drawImage(pigment as unknown as CanvasImageSource, 0, 0);
  });
}
