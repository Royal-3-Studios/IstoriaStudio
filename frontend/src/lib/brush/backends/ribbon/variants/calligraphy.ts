// FILE: src/lib/brush/backends/ribbon/variants/calligraphy.ts

import type { RenderOptions, RenderOverrides } from "@/lib/brush/engine";
import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer, get2D } from "@backends/utils/canvas";

// Use the shared stroke utilities you already have:
import {
  resamplePath, // returns {x,y,t,p}
  resolveSpacingFraction, // maps UI spacing to fraction of diameter
} from "@/lib/brush/backends/utils/stroke";

/** Extra per-variant knobs we support via engine.overrides. */
type CalligraphyOverrides = {
  /** Fixed chisel nib angle in degrees (0..180). */
  nibAngleDeg?: number;
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Angle-locked (chisel) calligraphy ribbon. */
export function drawRibbonCalligraphy(ctx: Ctx2D, opt: RenderOptions): void {
  const path = opt.path ?? [];
  if (path.length < 2) return;

  const color = opt.color ?? "#000000";
  const ov = (opt.engine.overrides ?? {}) as Partial<
    RenderOverrides & CalligraphyOverrides
  >;

  const flow01 = clamp01(((ov.flow as number | undefined) ?? 100) / 100);
  const opacity01 = clamp01(((ov.opacity as number | undefined) ?? 100) / 100);

  const viewW = Math.max(1, Math.floor(opt.width));
  const viewH = Math.max(1, Math.floor(opt.height));

  // Base size (CSS px)
  const baseR = Math.max(0.5, (opt.baseSizePx ?? 12) * 0.5);

  // Spacing: prefer engine.strokePath.spacing, then overrides.spacing, default 6
  const uiSpacing =
    opt.engine.strokePath?.spacing ?? (ov.spacing as number | undefined) ?? 6;

  const spacingFrac = resolveSpacingFraction(uiSpacing, 6);
  const stepPx = Math.max(0.4, Math.min(3.0, baseR * spacingFrac));

  // Resample path (we don't need tangent; fixed nib axis)
  const samples = resamplePath(path, stepPx);
  if (samples.length < 2) return;

  // Angle-locked nib (chisel)
  const nibAngleDeg = typeof ov.nibAngleDeg === "number" ? ov.nibAngleDeg : 45; // 0..180
  const rad = (nibAngleDeg * Math.PI) / 180;
  const ax = Math.cos(rad);
  const ay = Math.sin(rad); // nib axis

  // Precompute quads (simple diamond/pill per sample)
  const quads: Array<
    [number, number, number, number, number, number, number, number]
  > = [];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const p = Math.pow(clamp01(s.p), 0.9);
    const width = baseR * 2 * (0.65 + 0.6 * p); // simple pressure→width

    // chisel squash — reduce width along fixed axis
    const wx = width * 0.5 * ax;
    const wy = width * 0.5 * ay;

    // orthogonal to axis (a bit of thickness so it isn't razor thin)
    const nx = -ay;
    const ny = ax;
    const hx = width * 0.25 * nx;
    const hy = width * 0.25 * ny;

    // four corners (diamond-ish)
    const p1x = s.x - wx - hx,
      p1y = s.y - wy - hy;
    const p2x = s.x + wx - hx,
      p2y = s.y + wy - hy;
    const p3x = s.x + wx + hx,
      p3y = s.y + wy + hy;
    const p4x = s.x - wx + hx,
      p4y = s.y - wy + hy;

    quads.push([p1x, p1y, p2x, p2y, p3x, p3y, p4x, p4y]);
  }

  // Draw to a temp layer (so we can apply flow and then composite with opacity)
  const layer = createLayer(viewW, viewH);
  const lx = get2D(layer);

  lx.save();
  lx.globalCompositeOperation = "source-over";
  lx.globalAlpha = flow01;
  (lx as CanvasRenderingContext2D).fillStyle = color;

  lx.beginPath();
  for (const q of quads) {
    lx.moveTo(q[0], q[1]);
    lx.lineTo(q[2], q[3]);
    lx.lineTo(q[4], q[5]);
    lx.lineTo(q[6], q[7]);
    lx.closePath();
  }
  lx.fill();
  lx.restore();

  // Final composite to destination. Engine may apply overall backend blend too.
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = opacity01;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}
