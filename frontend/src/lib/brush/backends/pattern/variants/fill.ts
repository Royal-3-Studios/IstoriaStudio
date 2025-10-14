// FILE: src/lib/brush/backends/pattern/variants/fill.ts

import type { RenderOptions, RenderOverrides } from "@/lib/brush/engine.types";
import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer, get2D } from "@backends/utils/canvas";
import { withCompositeAndAlpha } from "../core/fill";
import {
  makeDotsTile,
  makeHatchTile,
  makeCheckerTile,
  makeHashNoiseTile,
} from "../utils/tiles";
import { rgbaFromHex, clamp01 } from "@backends/utils/color";

/** Pattern sources we support. */
export type PatternKind = "paper" | "canvas" | "noise" | "checker";

/** Backend-local overrides for the fill variant. */
export type PatternFillOverrides = Partial<{
  patternKind: PatternKind;
  patternScale: number; // affects tile density/size
  patternRotateDeg: number; // degrees; optional rotation while filling
  patternComposite: GlobalCompositeOperation; // final composite to destination
  patternHatchThickness: number; // only for "canvas" hatch
}>;

function asPatternKind(v: unknown): PatternKind {
  return v === "canvas" || v === "noise" || v === "checker" ? v : "paper";
}

/** Flood-fill the entire viewport with a color × pattern mix, then composite. */
export function drawPatternFill(ctx: Ctx2D, opt: RenderOptions): void {
  const viewW = Math.max(1, Math.floor(opt.width));
  const viewH = Math.max(1, Math.floor(opt.height));
  const color = opt.color ?? "#000000";

  // Global flow/opacity come from engine.overrides
  const ov = (opt.engine.overrides ?? {}) as Partial<RenderOverrides>;
  const flow01 = clamp01(((ov.flow ?? 100) as number) / 100);
  const opacity01 = clamp01(((ov.opacity ?? 100) as number) / 100);

  // Backend-local pattern overrides live under engine.backendOverrides?.pattern
  const pat =
    (opt.engine.backendOverrides?.pattern as
      | PatternFillOverrides
      | undefined) ?? {};
  const grain = opt.engine.grain ?? {};

  // Scale & rotation with sensible fallbacks (prefer backend-local, then grain)
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

  // Which tile to use: backend-local kind first, fall back to grain.kind, else "paper"
  const kind: PatternKind =
    pat.patternKind ?? asPatternKind(grain.kind as string | undefined);

  // Tile size derives from brush size and scale
  const baseRadius = Math.max(0.5, (opt.baseSizePx ?? 8) * 0.5);
  const tilePx = Math.max(
    8,
    Math.floor(baseRadius * 6 * (1 / Math.max(0.25, scale)))
  );

  // Thickness only matters for the "canvas" hatch
  const hatchThickness = Math.max(
    0.5,
    (typeof pat.patternHatchThickness === "number"
      ? pat.patternHatchThickness
      : Math.max(0.6, baseRadius * 0.06)) as number
  );

  // Final composite mode (default multiply to tint texture)
  const composite = ((pat.patternComposite as GlobalCompositeOperation) ??
    "multiply") as GlobalCompositeOperation;

  // Build the tile
  const seed = (opt.seed ?? 17) >>> 0;
  const tile =
    kind === "noise"
      ? makeHashNoiseTile(tilePx)
      : kind === "canvas"
        ? makeHatchTile(tilePx, hatchThickness)
        : kind === "paper"
          ? makeDotsTile(tilePx, 1.0, seed ^ 0x55aa)
          : makeCheckerTile(tilePx);

  // Paint into an offscreen layer
  const layer = createLayer(viewW, viewH);
  const lx = get2D(layer);
  lx.clearRect(0, 0, viewW, viewH);

  lx.save();

  // Optional rotation about the viewport center (kept simple for fill)
  if (rotateDeg) {
    lx.translate(viewW * 0.5, viewH * 0.5);
    lx.rotate((rotateDeg * Math.PI) / 180);
    lx.translate(-viewW * 0.5, -viewH * 0.5);
  }

  // 1) Solid color base (flow drives the base alpha)
  (lx as CanvasRenderingContext2D).fillStyle = rgbaFromHex(color, flow01);
  lx.fillRect(0, 0, viewW, viewH);

  // 2) Multiply the pattern
  const patObj = (lx as CanvasRenderingContext2D).createPattern(
    tile as unknown as CanvasImageSource,
    "repeat"
  );
  if (patObj) {
    lx.globalCompositeOperation = "multiply";
    (lx as CanvasRenderingContext2D).fillStyle = patObj;
    lx.fillRect(0, 0, viewW, viewH);
  }

  lx.restore();

  // Composite to destination respecting global opacity
  withCompositeAndAlpha(ctx, composite, opacity01, () => {
    ctx.drawImage(layer, 0, 0);
  });
}
