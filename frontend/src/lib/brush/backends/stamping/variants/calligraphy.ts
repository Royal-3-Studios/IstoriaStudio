// FILE: src/lib/brush/backends/stamping/variants/calligraphy.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer, get2D } from "@backends/utils/canvas";
import {
  spacingToStepPx,
  resampleWithAngle,
  type SamplePoint,
} from "../core/resample";
import { clamp01 } from "@backends/utils/color";

/** Optional shape for backendOverrides.stamping we care about here. */
type StampingBackendOverrides = {
  nibAngleDeg?: number; // 0..180, base chisel-nib angle
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function drawStampCalligraphy(ctx: Ctx2D, opt: RenderOptions): void {
  const path = opt.path ?? [];
  if (path.length < 2) return;

  const color = opt.color ?? "#000000";
  const flow01 = clamp01(
    ((opt.engine.overrides?.flow as number | undefined) ?? 100) / 100
  );
  const opacity01 = clamp01(
    ((opt.engine.overrides?.opacity as number | undefined) ?? 100) / 100
  );

  const viewW = Math.max(1, Math.floor(opt.width));
  const viewH = Math.max(1, Math.floor(opt.height));

  const baseR = Math.max(0.5, (opt.baseSizePx ?? 12) * 0.5);
  const stepPx = spacingToStepPx(opt, baseR);
  const samples: SamplePoint[] = resampleWithAngle(path, stepPx);
  if (samples.length < 2) return;

  // Variant-local overrides
  const stampingLocal = opt.engine.backendOverrides?.stamping as
    | StampingBackendOverrides
    | undefined;

  const nibAngleDeg = isFiniteNumber(stampingLocal?.nibAngleDeg)
    ? stampingLocal!.nibAngleDeg
    : 45;

  // Engine tilt routing knobs
  const ov = opt.engine.overrides ?? {};
  const tiltToFan = ov.tiltToFan ?? 0; // 0..1 (how much tilt changes fan/flatten)
  const tiltToSize = ov.tiltToSize ?? 0; // 0..1 (optional: how much tilt changes size)

  // Build quads (simple fat diamonds per sample), with per-sample rotation & fan
  const quads: Array<
    [number, number, number, number, number, number, number, number]
  > = [];

  // Precompute base nib radians
  const baseNibRad = (nibAngleDeg * Math.PI) / 180;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const p = Math.pow(clamp01(s.p), 0.9);

    // Pull tilt and direction/azimuth if available on the sample
    // - s.tilt is expected in 0..1; if your pipeline stores altitude (0..1), this already fits.
    // - s.a (or s.angle) is the stroke direction from resampleWithAngle (radians).
    const tilt01 = clamp01((s as unknown as { tilt?: number }).tilt ?? 0);
    const dirRad = isFiniteNumber((s as unknown as { a?: number }).a)
      ? (s as unknown as { a?: number }).a!
      : isFiniteNumber((s as unknown as { angle?: number }).angle)
        ? (s as unknown as { angle?: number }).angle!
        : 0;

    // Fan grows with tilt: 1.0 means no flattening; >1 elongates along nib axis
    const fan = 1 + tiltToFan * tilt01;

    // Optional: size grows with tilt
    const tiltSizeMul = 1 + tiltToSize * tilt01;

    // Rotation: bias the nib angle TOWARD the stroke direction as tilt increases.
    // We reuse tiltToFan as the bias strength (simple & effective), but you can add a separate knob if desired.
    const deltaToDir = normalizeAngle(dirRad - baseNibRad); // -PI..PI
    const effectiveRad = baseNibRad + deltaToDir * (tiltToFan * tilt01);

    // Nib main axis (ax,ay) and orthogonal (nx,ny)
    const ax = Math.cos(effectiveRad),
      ay = Math.sin(effectiveRad);
    const nx = -ay,
      ny = ax;

    // Width split across major/minor to create a chisel footprint
    const width = baseR * 2 * (0.65 + 0.6 * p) * tiltSizeMul;

    // Major axis gets scaled by fan; minor axis gets reduced inversely
    const major = width * 0.5 * fan;
    const minor = (width * 0.25) / fan;

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

/** Normalize angle to [-PI, PI] */
function normalizeAngle(a: number): number {
  let v = a;
  while (v <= -Math.PI) v += Math.PI * 2;
  while (v > Math.PI) v -= Math.PI * 2;
  return v;
}
