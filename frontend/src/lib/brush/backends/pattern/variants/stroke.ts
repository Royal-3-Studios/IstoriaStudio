// FILE: src/lib/brush/backends/pattern/variants/stroke.ts

import type { RenderOptions } from "@/lib/brush/engine";
import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer, get2D } from "@backends/utils/canvas";
import {
  resampleWithAngle,
  spacingToStepPx,
  buildRibbonOutline,
} from "../core/ribbon";
import { withClip, withCompositeAndAlpha } from "../core/fill";
import {
  makeDotsTile,
  makeHatchTile,
  makeCheckerTile,
  makeHashNoiseTile,
} from "../utils/tiles";
import { clamp01, rgbaFromHex } from "../core/color";

/** Style (pattern source) to use while stroking. */
export type PatternKind = "paper" | "canvas" | "noise" | "checker";

/** Extra overrides accepted by the stroke variant (backend-local). */
export type PatternStrokeOverrides = Partial<{
  patternKind: PatternKind;
  patternScale: number;
  patternRotateDeg: number;
  patternAlpha: number;
  patternContrast: number;
  patternTipFade: number;
  patternComposite: GlobalCompositeOperation;
  patternHatchThickness: number;
}>;

/** Narrow a string to PatternKind (fallback to "paper"). */
function asPatternKind(v: unknown): PatternKind {
  return v === "canvas" || v === "noise" || v === "checker" ? v : "paper";
}

/** Stroke path with a ribbon filled by a pattern. */
export function drawPatternStroke(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  if (pts.length < 2) return;

  const color = opt.color ?? "#000000";
  const viewW = Math.max(1, Math.floor(opt.width));
  const viewH = Math.max(1, Math.floor(opt.height));

  // Read only the keys that *are* in RenderOverrides from engine.overrides
  const ro = opt.engine.overrides ?? {};
  const flow01 = clamp01(((ro.flow as number | undefined) ?? 100) / 100);
  const opacity01 = clamp01(((ro.opacity as number | undefined) ?? 100) / 100);

  // Backend-local pattern overrides live under engine.backendOverrides?.pattern
  const pat =
    (opt.engine.backendOverrides?.pattern as
      | PatternStrokeOverrides
      | undefined) ?? {};

  // Base radius
  const baseRadius = Math.max(0.5, (opt.baseSizePx ?? 8) * 0.5);

  // Sample path
  const stepPx = spacingToStepPx(opt);
  const samples = resampleWithAngle(pts, stepPx);
  if (samples.length < 2) return;

  // Pressure -> width scaling with soft tips
  const widthAt = (u: number): number => {
    const i = Math.max(
      0,
      Math.min(samples.length - 1, Math.floor(u * (samples.length - 1)))
    );
    const s = samples[i]!;
    const tip = Math.min(s.t, 1 - s.t);
    const tipMask = Math.pow(Math.min(1, tip / 0.42), 2.7);
    const base =
      baseRadius * (0.7 + 0.6 * Math.pow(Math.max(0, Math.min(1, s.p)), 0.85));
    return Math.max(0.5, base * (0.84 + 0.12 * tipMask));
  };

  const outline = buildRibbonOutline(samples, widthAt);

  // --- Pattern parameters ---
  // Prefer backend-local overrides (pat.*), then engine.grain for scale/rotate/kind.
  const grain = opt.engine.grain ?? {};
  const kind: PatternKind =
    pat.patternKind ?? asPatternKind(grain.kind as string | undefined);
  const scale =
    (typeof pat.patternScale === "number" ? pat.patternScale : undefined) ??
    (typeof grain.scale === "number" ? (grain.scale as number) : undefined) ??
    1.0;
  const rotateDeg =
    (typeof pat.patternRotateDeg === "number"
      ? pat.patternRotateDeg
      : undefined) ??
    (typeof grain.rotate === "number" ? (grain.rotate as number) : undefined) ??
    0;
  const patternAlpha = clamp01(
    ((typeof pat.patternAlpha === "number"
      ? pat.patternAlpha
      : 1.0) as number) * flow01
  );
  const contrast = clamp01(
    (typeof pat.patternContrast === "number"
      ? pat.patternContrast
      : 0.28) as number
  );
  const tipFadeAmt = clamp01(
    (typeof pat.patternTipFade === "number"
      ? pat.patternTipFade
      : 0.35) as number
  );
  const hatchThickness = Math.max(
    0.5,
    (typeof pat.patternHatchThickness === "number"
      ? pat.patternHatchThickness
      : Math.max(0.6, baseRadius * 0.06)) as number
  );
  const composite = ((pat.patternComposite as
    | GlobalCompositeOperation
    | undefined) ?? "multiply") as GlobalCompositeOperation;

  // Tile generation
  const seed = (opt.seed ?? 17) >>> 0;
  const tilePx = Math.max(
    8,
    Math.floor(baseRadius * 6 * (1 / Math.max(0.25, scale ?? 1)))
  );
  const tile =
    kind === "noise"
      ? makeHashNoiseTile(tilePx)
      : kind === "canvas"
        ? makeHatchTile(tilePx, hatchThickness)
        : kind === "paper"
          ? makeDotsTile(tilePx, 1.0, seed ^ 0x55aa)
          : makeCheckerTile(tilePx);

  // Prepare a layer and clip to ribbon
  const layer = createLayer(viewW, viewH);
  const lx = get2D(layer);
  lx.clearRect(0, 0, viewW, viewH);

  // Build the colored base + multiplied pattern into this layer
  withClip(lx, outline, () => {
    // Rotate about stroke start (cheap & stable)
    const first = samples[0]!;
    lx.save();
    lx.translate(first.x, first.y);
    lx.rotate((rotateDeg * Math.PI) / 180);
    lx.translate(-first.x, -first.y);

    // 1) Fill with stroke color (so pattern multiplies into it)
    (lx as CanvasRenderingContext2D).fillStyle = rgbaFromHex(
      color,
      patternAlpha
    );
    lx.fillRect(0, 0, viewW, viewH);

    // 2) Multiply pattern
    const patObj = (lx as CanvasRenderingContext2D).createPattern(
      tile as unknown as CanvasImageSource,
      "repeat"
    );
    if (patObj) {
      lx.globalCompositeOperation = "multiply";
      (lx as CanvasRenderingContext2D).fillStyle = patObj;
      lx.fillRect(0, 0, viewW, viewH);
    }

    // 3) Optional contrast pass
    if (contrast > 0.001) {
      lx.globalCompositeOperation = "multiply";
      lx.globalAlpha = contrast * patternAlpha;
      (lx as CanvasRenderingContext2D).fillStyle = "#000";
      lx.fillRect(0, 0, viewW, viewH);
      lx.globalAlpha = 1;
    }

    // 4) Optional tip fade
    if (tipFadeAmt > 0.001) {
      const last = samples[samples.length - 1]!;
      lx.globalCompositeOperation = "destination-in";
      const grad = (lx as CanvasRenderingContext2D).createLinearGradient(
        first.x,
        first.y,
        last.x,
        last.y
      );
      grad.addColorStop(0.0, `rgba(0,0,0,${tipFadeAmt.toFixed(2)})`);
      grad.addColorStop(0.08, "rgba(0,0,0,1.0)");
      grad.addColorStop(0.92, "rgba(0,0,0,1.0)");
      grad.addColorStop(1.0, `rgba(0,0,0,${tipFadeAmt.toFixed(2)})`);
      (lx as CanvasRenderingContext2D).fillStyle = grad;
      lx.fillRect(0, 0, viewW, viewH);
    }

    lx.restore();
  });

  // Final composite (engine may still apply global blend/opacity)
  withCompositeAndAlpha(ctx, composite, opacity01, () => {
    ctx.drawImage(layer, 0, 0);
  });
}
