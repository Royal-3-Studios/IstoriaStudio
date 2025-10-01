// FILE: src/lib/brush/backends/impasto/variants/bristle.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import type { Ctx2D } from "@/lib/canvas/context";
import { createLayer, get2DContext } from "@/lib/canvas/context";
import { Blend } from "@backends";

import { drawHeightStamps, blurLayerInPlace } from "../core/heightfield";
import { shadeFromHeightAlpha } from "../core/lighting";
import { pigmentFrom, applyShading, applySpecular } from "../core/paint-merge";
import {
  pressureToRadius,
  pressureToAlpha,
  jitterAmount,
} from "../core/bristle-model";
import { resample, resolveSpacingFraction, seededRng } from "./_common";
import type { ImpastoOverrides } from "@/lib/brush/engine.types";

/** Bristle: micro-jittery bristle footprint with height shading + optional spec. */
export function drawImpastoBristle(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  if (pts.length < 2) return;

  const w = Math.max(1, Math.floor(opt.width));
  const h = Math.max(1, Math.floor(opt.height));
  const baseSizePx = Math.max(1, opt.baseSizePx || 12);
  const color = opt.color ?? "#000000";

  // cross-backend overrides (use only general knobs, e.g. spacing)
  const ov = opt.engine.overrides ?? {};
  // backend-specific impasto knobs
  const imp: ImpastoOverrides = (opt.engine.backendOverrides?.impasto ??
    {}) as ImpastoOverrides;

  // spacing → step
  const spacingUI =
    opt.engine.strokePath?.spacing ??
    (typeof ov.spacing === "number" ? ov.spacing : undefined) ??
    6;
  const spacingFrac = resolveSpacingFraction(spacingUI, 6);
  const stepPx = Math.max(0.5, Math.min(2.2, baseSizePx * spacingFrac));

  const samples = resample(pts, stepPx, opt.input);
  if (samples.length < 2) return;

  const rng = seededRng(opt);

  // Build height stamps with slight normal-direction jitter per segment
  const stamps = samples.slice(1).map((b, i) => {
    const a = samples[i]!;
    const pMid = (a.p + b.p) * 0.5;

    const r = pressureToRadius(pMid, { baseSizePx, jitterPx: 0.2 });
    const alpha = pressureToAlpha(pMid, { baseSizePx });

    // unit normal from tangent angle
    const nx = -Math.sin(b.ang);
    const ny = Math.cos(b.ang);
    const j = jitterAmount(0.15, rng);

    return {
      ax: a.x + nx * j,
      ay: a.y + ny * j,
      bx: b.x + nx * j,
      by: b.y + ny * j,
      radius: r,
      alpha,
      color,
    };
  });

  // Height field (alpha is height)
  const heightLayer = drawHeightStamps(w, h, stamps);
  blurLayerInPlace(heightLayer, Math.max(0, imp.heightBlurPx ?? 0.6));

  // Shade from height (Sobel normals → Lambert)
  const hctx: Ctx2D = get2DContext(heightLayer, { alpha: true });
  const heightImg = hctx.getImageData(0, 0, w, h);

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
  const scx: Ctx2D = get2DContext(shadeCanvas, { alpha: true });
  scx.putImageData(shadeImg, 0, 0);

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
