// FILE: src/lib/brush/backends/impasto/variants/knife.ts
import type { RenderOptions, ImpastoOverrides } from "@/lib/brush/engine.types";
import { Blend } from "@backends";
import type { Ctx2D } from "@/lib/canvas/context";
import { createLayer, get2DContext } from "@/lib/canvas/context";

import { drawHeightStamps, blurLayerInPlace } from "../core/heightfield";
import { shadeFromHeightAlpha } from "../core/lighting";
import { pigmentFrom, applyShading, applySpecular } from "../core/paint-merge";
import { resample, resolveSpacingFraction } from "./_common";

/**
 * Knife: flatter, broader plate; less “bristle” jitter; angle-biased thickness.
 */
export function drawImpastoKnife(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  if (pts.length < 2) return;

  const w = Math.max(1, Math.floor(opt.width));
  const h = Math.max(1, Math.floor(opt.height));
  const baseSizePx = Math.max(1, opt.baseSizePx || 14);
  const color = opt.color ?? "#000000";

  // generic cross-backend overrides (e.g. spacing)
  const ov = opt.engine.overrides ?? {};
  // impasto-specific overrides (lighting/spec/relief/ambient, knife knobs, etc.)
  const imp: ImpastoOverrides = (opt.engine.backendOverrides?.impasto ??
    {}) as ImpastoOverrides;

  const spacingUI =
    opt.engine.strokePath?.spacing ??
    (typeof ov.spacing === "number" ? ov.spacing : undefined) ??
    5;
  const spacingFrac = resolveSpacingFraction(spacingUI, 5);
  const stepPx = Math.max(0.4, Math.min(2.0, baseSizePx * spacingFrac));

  const samples = resample(pts, stepPx, opt.input);
  if (samples.length < 2) return;

  // Knife: use angle to slightly widen/thin footprint (impasto-specific knob)
  const angleGain = Math.max(0, Math.min(1, imp.knifeAngleGain ?? 0.25));

  const stamps = samples.slice(1).map((b, i) => {
    const a = samples[i]!;
    const pMid = (a.p + b.p) * 0.5;
    const dir = Math.abs(Math.cos(b.ang)); // 0 at 90°, 1 at 0°
    const radius = Math.max(
      0.75,
      baseSizePx *
        0.6 *
        (0.55 + 0.8 * Math.pow(pMid, 0.9)) *
        (1 + angleGain * dir)
    );
    const alpha = 0.42 + 0.45 * Math.pow(pMid, 0.9);
    return { ax: a.x, ay: a.y, bx: b.x, by: b.y, radius, alpha, color };
  });

  const heightLayer = drawHeightStamps(w, h, stamps);
  blurLayerInPlace(heightLayer, 0.45);

  const hctx: Ctx2D = get2DContext(heightLayer, { alpha: true });
  const heightImg = hctx.getImageData(0, 0, w, h);

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
  const scx: Ctx2D = get2DContext(shadeCanvas, { alpha: true });
  scx.putImageData(shadeImg, 0, 0);

  const pigment = pigmentFrom(heightLayer, color);
  applyShading(pigment, shadeCanvas);

  // Specular controls also come from impasto overrides
  const specAmt = Math.max(0, Math.min(1, imp.specAmount ?? 0.28));
  const specFromShade = Math.max(0, Math.min(1, imp.specFromShade ?? 1));
  applySpecular(pigment, shadeCanvas, specAmt, specFromShade);

  Blend.withComposite(ctx, "source-over", () => {
    ctx.drawImage(pigment as unknown as CanvasImageSource, 0, 0);
  });
}
