// FILE: src/lib/brush/backends/impasto/variants/rake.ts
import type { RenderOptions, ImpastoOverrides } from "@/lib/brush/engine.types";
import { Blend } from "@backends";
import type { Ctx2D } from "@/lib/canvas/context";
import { createLayer, get2DContext } from "@/lib/canvas/context";

import { drawHeightStamps, blurLayerInPlace } from "../core/heightfield";
import { shadeFromHeightAlpha } from "../core/lighting";
import { pigmentFrom, applyShading } from "../core/paint-merge";
import { resample, resolveSpacingFraction } from "./_common";

/**
 * Rake: lay paint then carve parallel grooves (destination-out stripes).
 */
export function drawImpastoRake(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  if (pts.length < 2) return;

  const w = Math.max(1, Math.floor(opt.width));
  const h = Math.max(1, Math.floor(opt.height));
  const baseSizePx = Math.max(1, opt.baseSizePx || 12);
  const color = opt.color ?? "#000000";

  // Cross-backend overrides (e.g. spacing)
  const ov = opt.engine.overrides ?? {};
  // Impasto-specific controls (lighting, relief/ambient, rake knobs, etc.)
  const imp: ImpastoOverrides = (opt.engine.backendOverrides?.impasto ??
    {}) as ImpastoOverrides;

  const spacingUI =
    opt.engine.strokePath?.spacing ??
    (typeof ov.spacing === "number" ? ov.spacing : undefined) ??
    6;
  const spacingFrac = resolveSpacingFraction(spacingUI, 6);
  const stepPx = Math.max(0.5, Math.min(2.2, baseSizePx * spacingFrac));

  const samples = resample(pts, stepPx, opt.input);
  if (samples.length < 2) return;

  const stamps = samples.slice(1).map((b, i) => {
    const a = samples[i]!;
    const pMid = (a.p + b.p) * 0.5;
    const radius = Math.max(
      0.7,
      baseSizePx * 0.55 * (0.55 + 0.85 * Math.pow(pMid, 0.9))
    );
    const alpha = 0.36 + 0.45 * Math.pow(pMid, 0.95);
    return { ax: a.x, ay: a.y, bx: b.x, by: b.y, radius, alpha, color };
  });

  const heightLayer = drawHeightStamps(w, h, stamps);
  blurLayerInPlace(heightLayer, 0.55);

  // Shade
  const hctx: Ctx2D = get2DContext(heightLayer, { alpha: true });
  const heightImg = hctx.getImageData(0, 0, w, h);

  const az = ((imp.lightAzimuthDeg ?? 35) * Math.PI) / 180;
  const el = ((imp.lightElevationDeg ?? 55) * Math.PI) / 180;
  const L = {
    x: Math.cos(el) * Math.cos(az),
    y: Math.cos(el) * Math.sin(az),
    z: Math.sin(el),
  };

  const reliefIntensity = Math.max(0.1, imp.reliefIntensity ?? 1.3);
  const ambient = Math.max(0, Math.min(1, imp.ambient ?? 0.24));

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

  // Pigment
  const pigment = pigmentFrom(heightLayer, color);
  applyShading(pigment, shadeCanvas);

  // Rake grooves: carve parallel thin lines along the stroke direction
  const gx: Ctx2D = get2DContext(pigment, { alpha: true });
  gx.save();
  gx.globalCompositeOperation = "destination-out";
  (gx as unknown as { strokeStyle: string }).strokeStyle = "rgba(0,0,0,0.9)";
  (gx as unknown as { lineCap: CanvasLineCap }).lineCap = "round";

  // Carve by re-walking samples with periodic offsets
  const grooveCount = Math.max(2, Math.min(12, imp.rakeGrooves ?? 4));
  const grooveSpacing = Math.max(0.6, Math.min(6, imp.rakeSpacing ?? 1.6));

  for (
    let g = -Math.floor(grooveCount / 2);
    g <= Math.floor(grooveCount / 2);
    g++
  ) {
    if (g === 0 && grooveCount % 2 === 1) continue; // keep symmetric pairs
    gx.beginPath();
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!;
      const nx = -Math.sin(s.ang);
      const ny = Math.cos(s.ang);
      const off = g * grooveSpacing;
      const x = s.x + nx * off;
      const y = s.y + ny * off;
      if (i === 0) gx.moveTo(x, y);
      else gx.lineTo(x, y);
    }
    (gx as unknown as { lineWidth: number }).lineWidth = Math.max(
      0.4,
      baseSizePx * 0.06
    );
    gx.stroke();
  }
  gx.restore();

  Blend.withComposite(ctx, "source-over", () => {
    ctx.drawImage(pigment as unknown as CanvasImageSource, 0, 0);
  });
}
