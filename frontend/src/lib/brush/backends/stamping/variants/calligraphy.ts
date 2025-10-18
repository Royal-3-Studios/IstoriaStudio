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
  /** Base chisel-nib angle in degrees (0..180). */
  nibAngleDeg?: number;
};

/* --------------------------------- helpers -------------------------------- */

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

type CurvePoint = { x: number; y: number };
type MaybeCurve = ReadonlyArray<CurvePoint> | undefined;

/** Piecewise-linear curve evaluator with linear fallback. Expects x in [0,1]. */
function sampleCurve01(curve: MaybeCurve, t: number): number {
  const T = clamp01(t);
  if (!curve || curve.length === 0) return T;
  let prev = curve[0]!;
  if (T <= prev.x) return clamp01(prev.y);
  for (let i = 1; i < curve.length; i++) {
    const next = curve[i]!;
    if (T <= next.x) {
      const u = (T - prev.x) / Math.max(1e-6, next.x - prev.x);
      return clamp01(prev.y + (next.y - prev.y) * u);
    }
    prev = next;
  }
  return clamp01(prev.y);
}

/** px/s based on sample timestamps; falls back to ~60 FPS if t missing. */
function segmentSpeedPxPerSec(a: SamplePoint, b: SamplePoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  // Our SamplePoint has t as 0..1 path param (not absolute ms), so assume frame dt when missing
  const ta = (a as unknown as { timeMs?: number }).timeMs;
  const tb = (b as unknown as { timeMs?: number }).timeMs;
  const dtSec =
    isFiniteNumber(ta) && isFiniteNumber(tb)
      ? Math.max(1 / 120, (tb - ta) / 1000)
      : 1 / 60;
  return dist / dtSec;
}

/** Normalize angle to [-PI, PI]. */
function normalizeAngle(a: number): number {
  let v = a;
  while (v <= -Math.PI) v += Math.PI * 2;
  while (v > Math.PI) v -= Math.PI * 2;
  return v;
}

/* -------------------------------- renderer -------------------------------- */

export default function drawStampCalligraphy(
  ctx: Ctx2D,
  opt: RenderOptions
): void {
  const path = opt.path ?? [];
  if (path.length < 2) return;

  const viewW = Math.max(1, Math.floor(opt.width));
  const viewH = Math.max(1, Math.floor(opt.height));

  const baseRadius = Math.max(0.5, (opt.baseSizePx ?? 12) * 0.5);
  const stepPx = spacingToStepPx(opt, baseRadius);
  const samples: SamplePoint[] = resampleWithAngle(path, stepPx);
  if (samples.length < 2) return;

  // ---- Overrides & composite ------------------------------------------------
  const ov = opt.engine.overrides ?? {};
  const color = opt.color ?? "#000000";

  const composite: GlobalCompositeOperation =
    ((ov as Record<string, unknown>).composite as GlobalCompositeOperation) ??
    opt.engine.rendering?.blendMode ??
    "source-over";

  const flow01 = clamp01(((ov.flow as number | undefined) ?? 100) / 100);
  const baseOpacity01 = clamp01(
    ((ov.opacity as number | undefined) ?? 100) / 100
  );

  // Optional curves (pressure→width, pressure→flow, speed→flow); ref speed
  const pressureToWidthCurve = (ov as { pressureToWidthCurve?: MaybeCurve })
    .pressureToWidthCurve;
  const pressureToFlowCurve = (ov as { pressureToFlowCurve?: MaybeCurve })
    .pressureToFlowCurve;
  const speedToFlowCurve = (ov as { speedToFlowCurve?: MaybeCurve })
    .speedToFlowCurve;

  const speedNormRefPxPerSec =
    (ov as { speedNormRefPxPerSec?: number }).speedNormRefPxPerSec ?? 1000; // ~1k px/s = “fast”

  // Tilt routing
  const tiltToFan = (ov.tiltToFan as number | undefined) ?? 0; // 0..1
  const tiltToSize = (ov.tiltToSize as number | undefined) ?? 0; // 0..1

  // Variant-local overrides
  const stampingLocal = opt.engine.backendOverrides?.stamping as
    | StampingBackendOverrides
    | undefined;

  const nibAngleDeg = isFiniteNumber(stampingLocal?.nibAngleDeg)
    ? stampingLocal!.nibAngleDeg
    : 45;

  // Build quads (per-sample chisel footprints) with curve- & speed-aware alpha
  type Quad = [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]; // + alpha at end
  const quads: Quad[] = [];

  const baseNibRad = (nibAngleDeg * Math.PI) / 180;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const prev = samples[i > 0 ? i - 1 : i]!;
    const spd = segmentSpeedPxPerSec(prev, s); // px/s

    // Pressure & curves
    const p01 = clamp01(Math.pow(clamp01(s.p), 0.9));
    const widthScaleFromPressure = sampleCurve01(pressureToWidthCurve, p01);
    const flowScaleFromPressure = sampleCurve01(pressureToFlowCurve, p01);

    // Speed curve uses normalized speed
    const speedNorm = clamp01(spd / Math.max(1, speedNormRefPxPerSec));
    const flowScaleFromSpeed = sampleCurve01(speedToFlowCurve, speedNorm);

    // Alpha multiplier
    const alphaMul = clamp01(
      flow01 * flowScaleFromPressure * flowScaleFromSpeed
    );
    if (alphaMul <= 0.001) continue;

    // Direction from neighboring samples (we don't carry angle in SamplePoint)
    const dirRad = Math.atan2(s.y - prev.y, s.x - prev.x);

    // Tilt
    const tilt01 = clamp01((s as unknown as { tilt?: number }).tilt ?? 0);

    // Fan grows with tilt: 1.0 → no flatten; >1 elongates along nib axis
    const fan = 1 + clamp01(tiltToFan) * tilt01;

    // Optional size growth with tilt
    const tiltSizeMul = 1 + clamp01(tiltToSize) * tilt01;

    // Nib rotates toward stroke direction as tilt increases (simple bias)
    const deltaToDir = normalizeAngle(dirRad - baseNibRad);
    const effectiveRad =
      baseNibRad + deltaToDir * (clamp01(tiltToFan) * tilt01);

    // Axes
    const ax = Math.cos(effectiveRad),
      ay = Math.sin(effectiveRad);
    const nx = -ay,
      ny = ax;

    // Width from base radius, pressure curve, tilt size
    const widthPx =
      baseRadius * 2 * (0.7 + 0.6 * widthScaleFromPressure) * tiltSizeMul;

    // Major axis gets scaled by fan; minor axis reduced inversely
    const major = widthPx * 0.5 * fan;
    const minor = (widthPx * 0.25) / Math.max(0.001, fan);

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

    quads.push([p1x, p1y, p2x, p2y, p3x, p3y, p4x, p4y, alphaMul]);
  }

  // Paint into a layer with flow (alphaMul) per quad, then composite with opacity+mode
  const layer = createLayer(viewW, viewH);
  const lx = get2D(layer);
  lx.save();
  lx.globalCompositeOperation = "source-over";
  (lx as CanvasRenderingContext2D).fillStyle = color;

  for (const q of quads) {
    const alphaMul = q[8]!;
    lx.globalAlpha = alphaMul;
    lx.beginPath();
    lx.moveTo(q[0], q[1]);
    lx.lineTo(q[2], q[3]);
    lx.lineTo(q[4], q[5]);
    lx.lineTo(q[6], q[7]);
    lx.closePath();
    lx.fill();
  }
  lx.restore();

  // Final composite to destination
  ctx.save();
  (ctx as CanvasRenderingContext2D).globalCompositeOperation = composite;
  ctx.globalAlpha = baseOpacity01;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}
