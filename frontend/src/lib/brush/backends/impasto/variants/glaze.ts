// FILE: src/lib/brush/backends/impasto/variants/glaze.ts
import type { RenderOptions, ImpastoOverrides } from "@/lib/brush/engine.types";
import { Blend } from "@backends";
import type { Ctx2D } from "@/lib/canvas/context";
import { createLayer, get2DContext } from "@/lib/canvas/context";

import { drawHeightStamps, blurLayerInPlace } from "../core/heightfield";
import { shadeFromHeightAlpha } from "../core/lighting";
import { pigmentFrom, applyShading } from "../core/paint-merge";
import { resample, resolveSpacingFraction } from "./_common";

/** Glaze: thin translucent coat that mostly follows existing shade. */
export function drawImpastoGlaze(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  if (pts.length < 2) return;

  const w = Math.max(1, Math.floor(opt.width));
  const h = Math.max(1, Math.floor(opt.height));
  const baseSizePx = Math.max(1, opt.baseSizePx || 10);
  const color = opt.color ?? "#000000";

  // Generic cross-backend overrides (only use widely-shared knobs like spacing)
  const ov = opt.engine.overrides ?? {};
  // Impasto-specific overrides (lighting, relief, ambient, etc.)
  const imp: ImpastoOverrides = (opt.engine.backendOverrides?.impasto ??
    {}) as ImpastoOverrides;

  // spacing → step
  const spacingUI =
    opt.engine.strokePath?.spacing ??
    (typeof ov.spacing === "number" ? ov.spacing : undefined) ??
    8;
  const spacingFrac = resolveSpacingFraction(spacingUI, 8);
  const stepPx = Math.max(0.5, Math.min(2.4, baseSizePx * spacingFrac));

  const samples = resample(pts, stepPx, opt.input);
  if (samples.length < 2) return;

  const stamps = samples.slice(1).map((b, i) => {
    const a = samples[i]!;
    const pMid = (a.p + b.p) * 0.5;
    const radius = Math.max(
      0.6,
      baseSizePx * 0.5 * (0.5 + 0.7 * Math.pow(pMid, 0.9))
    );
    const alpha = 0.18 + 0.35 * Math.pow(pMid, 1.0); // thinner coat
    return { ax: a.x, ay: a.y, bx: b.x, by: b.y, radius, alpha, color };
  });

  const heightLayer = drawHeightStamps(w, h, stamps);
  blurLayerInPlace(heightLayer, 0.35);

  const hctx: Ctx2D = get2DContext(heightLayer, { alpha: true });
  const heightImg = hctx.getImageData(0, 0, w, h);

  // Lighting/relief come from impasto backend overrides
  const az = ((imp.lightAzimuthDeg ?? 30) * Math.PI) / 180;
  const el = ((imp.lightElevationDeg ?? 65) * Math.PI) / 180;
  const L = {
    x: Math.cos(el) * Math.cos(az),
    y: Math.cos(el) * Math.sin(az),
    z: Math.sin(el),
  };

  const reliefIntensity = Math.max(0.1, imp.reliefIntensity ?? 0.9);
  const ambient = Math.max(0, Math.min(1, imp.ambient ?? 0.3));
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

  // No specular by default for glaze
  Blend.withComposite(ctx, "source-over", () => {
    ctx.drawImage(pigment as unknown as CanvasImageSource, 0, 0);
  });
}
