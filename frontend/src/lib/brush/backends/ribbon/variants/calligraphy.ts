// FILE: src/lib/brush/backends/ribbon/variants/calligraphy.ts
import type { RenderOptions, RenderOverrides } from "@/lib/brush/engine.types";
import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer, get2D } from "@backends/utils/canvas";

// Use the shared stroke utilities you already have:
import {
  resamplePath, // returns {x,y,t,p}
  resolveSpacingFraction, // maps UI spacing to fraction of diameter
} from "@backends/utils/stroke";

/** Extra per-variant knobs we support via engine.overrides. */
type CalligraphyOverrides = {
  /** Fixed base chisel nib angle in degrees (0..180). */
  nibAngleDeg?: number;
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** Angle/fan calligraphy ribbon with tilt routing:
 *  - tilt→fan (flattening)
 *  - tilt→rotation (bias toward stroke direction)
 */
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

  // Resample path (positions & pressure)
  const samples = resamplePath(path, stepPx);
  if (samples.length < 2) return;

  // --- Tilt routing knobs (0..1 strength scalars) ---------------------------
  const tiltToFan = ov.tiltToFan ?? 0; // >0: flatter/longer nib at higher tilt
  const tiltToSize = ov.tiltToSize ?? 0; // optional: grow size with tilt

  // Compute a simple average tilt across original points (0..1)
  const tiltVals: number[] = [];
  for (let i = 0; i < path.length; i++) {
    const t = (path[i] as { tilt?: number }).tilt;
    if (isNum(t)) tiltVals.push(clamp01(t));
  }
  const avgTilt01 = tiltVals.length
    ? tiltVals.reduce((a, b) => a + b, 0) / tiltVals.length
    : 0;

  // Base nib angle
  const nibAngleDeg = isNum(ov.nibAngleDeg) ? ov.nibAngleDeg : 45;
  const baseNibRad = (nibAngleDeg * Math.PI) / 180;

  // --- Build quads with per-sample rotation & fan ---------------------------
  const quads: Array<
    [number, number, number, number, number, number, number, number]
  > = [];

  // Helper: direction of the ribbon at sample i
  const dirAt = (i: number): number => {
    const a = i > 0 ? samples[i - 1]! : samples[i]!;
    const b = i + 1 < samples.length ? samples[i + 1]! : samples[i]!;
    return Math.atan2(b.y - a.y, b.x - a.x);
  };

  // Rotation bias: push the nib angle toward stroke direction as tilt increases
  const rotationBiasStrength = clamp01(tiltToFan) * avgTilt01; // reuse tiltToFan for bias strength

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const p = Math.pow(clamp01(s.p), 0.9);

    // Size & fan with tilt
    const sizeMul = 1 + clamp01(tiltToSize) * avgTilt01;
    const fan = 1 + clamp01(tiltToFan) * avgTilt01;

    const width = baseR * 2 * (0.65 + 0.6 * p) * sizeMul;

    // Effective nib angle
    const strokeDir = dirAt(i);
    const deltaToDir = normalizeAngle(strokeDir - baseNibRad); // -PI..PI
    const effectiveRad = baseNibRad + deltaToDir * rotationBiasStrength;

    // Nib main axis and orthogonal
    const ax = Math.cos(effectiveRad),
      ay = Math.sin(effectiveRad);
    const nx = -ay,
      ny = ax;

    // Major/minor axes based on fan
    const major = width * 0.5 * fan;
    const minor = (width * 0.25) / Math.max(1e-6, fan);

    const wx = major * ax,
      wy = major * ay;
    const hx = minor * nx,
      hy = minor * ny;

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

  // Draw to a temp layer (apply flow), then composite with opacity
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

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = opacity01;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

function normalizeAngle(a: number): number {
  let v = a;
  while (v <= -Math.PI) v += Math.PI * 2;
  while (v > Math.PI) v -= Math.PI * 2;
  return v;
}
