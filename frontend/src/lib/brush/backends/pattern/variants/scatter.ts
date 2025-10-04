// FILE: src/lib/brush/backends/pattern/variants/scatter.ts

import type { RenderOptions, RenderOverrides } from "@/lib/brush/engine";
import type { Ctx2D } from "../utils/canvas";
import { createLayer, get2D } from "../utils/canvas";
import { pathToStamps } from "@/lib/brush/backends/utils/stroke";
import { withCompositeAndAlpha } from "../core/fill";
import {
  makeDotsTile,
  makeHatchTile,
  makeCheckerTile,
  makeHashNoiseTile,
} from "../utils/tiles";
import { clamp01 } from "../core/color";

/** Pattern sources we support. */
export type PatternKind = "paper" | "canvas" | "noise" | "checker";

/** Backend-local overrides for the scatter variant. */
export type PatternScatterOverrides = Partial<{
  patternKind: PatternKind;
  patternScale: number; // affects tile density/size
  patternRotateDeg: number; // not used in scatter (kept for parity)
  patternAlpha: number; // not used (scatter uses flow/opacity), kept for parity
  patternContrast: number; // not used in scatter, kept for parity
  patternTipFade: number; // not used in scatter, kept for parity
  patternComposite: GlobalCompositeOperation; // not used in scatter
  patternHatchThickness: number; // only for "canvas" hatch
}>;

function asPatternKind(v: unknown): PatternKind {
  return v === "canvas" || v === "noise" || v === "checker" ? v : "paper";
}

/** Scatter pattern tiles like spray (stampsPerStep >= 1). */
export function drawPatternScatter(ctx: Ctx2D, opt: RenderOptions): void {
  const pts = opt.path ?? [];
  if (pts.length < 2) return;

  const viewW = Math.max(1, Math.floor(opt.width));
  const viewH = Math.max(1, Math.floor(opt.height));

  // Global flow/opacity are valid on engine.overrides
  const ov = (opt.engine.overrides ?? {}) as Partial<RenderOverrides>;
  const flow01 = clamp01(((ov.flow ?? 100) as number) / 100);
  const opacity01 = clamp01(((ov.opacity ?? 100) as number) / 100);

  // Spacing/jitter/scatter also come from strokePath/overrides
  const spacingPercent = (opt.engine.strokePath?.spacing ??
    (ov.spacing as number | undefined) ??
    8) as number;
  const jitterPercent =
    ((opt.engine.strokePath?.jitter ??
      (ov.jitter as number | undefined) ??
      2) as number) * 100;
  const scatterPx = (opt.engine.strokePath?.scatter ??
    (ov.scatter as number | undefined) ??
    4) as number;

  // Backend-local pattern overrides live under engine.backendOverrides?.pattern
  const pat =
    (opt.engine.backendOverrides?.pattern as
      | PatternScatterOverrides
      | undefined) ?? {};
  const grain = opt.engine.grain ?? {};

  const baseR = Math.max(0.5, (opt.baseSizePx ?? 10) * 0.5);

  // Size and density of the tile can respect a "scale" (like grain.scale)
  const scale =
    (typeof pat.patternScale === "number" ? pat.patternScale : undefined) ??
    (typeof grain.scale === "number" ? (grain.scale as number) : undefined) ??
    1.0;

  const tilePx = Math.max(
    8,
    Math.floor(baseR * 3 * (1 / Math.max(0.25, scale)))
  );

  const kind: PatternKind =
    pat.patternKind ?? asPatternKind(grain.kind as string | undefined);

  const hatchThickness = Math.max(
    0.5,
    (typeof pat.patternHatchThickness === "number"
      ? pat.patternHatchThickness
      : Math.max(0.5, baseR * 0.08)) as number
  );

  const seed = (opt.seed ?? 9) >>> 0;
  const tile =
    kind === "noise"
      ? makeHashNoiseTile(tilePx)
      : kind === "canvas"
        ? makeHatchTile(tilePx, hatchThickness)
        : kind === "paper"
          ? makeDotsTile(tilePx, 1.0, seed ^ 0xa5a5)
          : makeCheckerTile(tilePx);

  // Place stamps like a spray
  const stamps = pathToStamps(pts, {
    baseSizePx: opt.baseSizePx ?? 12,
    spacingPercent,
    jitterPercent,
    scatterPx,
    stampsPerStep: 1,
    streamline: opt.engine.strokePath?.streamline ?? 0,
    angleFollowDirection: 0,
    angleJitterDeg: 0,
    tipMinPx: 0,
    tipScaleStart: 0.95,
    tipScaleEnd: 0.95,
    taperProfileStart: "linear",
    taperProfileEnd: "linear",
    endBias: 0,
    uniformity: 0,
  });
  if (!stamps.length) return;

  // draw each stamp as a small pattern-filled rect (cheap but effective)
  const layer = createLayer(viewW, viewH);
  const lx = get2D(layer);
  lx.clearRect(0, 0, viewW, viewH);

  const patObj = (lx as CanvasRenderingContext2D).createPattern(
    tile as unknown as CanvasImageSource,
    "repeat"
  );
  if (!patObj) return;

  lx.save();
  lx.globalAlpha = flow01;
  for (let i = 0; i < stamps.length; i++) {
    const s = stamps[i]!;
    const r = Math.max(2, baseR * (0.6 + 0.6 * s.pressure));
    lx.save();
    lx.translate(s.x, s.y);
    lx.rotate((s.tangentDeg * Math.PI) / 180); // orient rect along stroke
    (lx as CanvasRenderingContext2D).fillStyle = patObj;
    lx.fillRect(-r, -r, r * 2, r * 2);
    lx.restore();
  }
  lx.restore();

  withCompositeAndAlpha(ctx, "source-over", opacity01, () => {
    ctx.drawImage(layer, 0, 0);
  });
}
