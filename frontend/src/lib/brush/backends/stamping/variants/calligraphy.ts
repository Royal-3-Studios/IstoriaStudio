// FILE: src/lib/brush/backends/stamping/variants/calligraphy.ts
import type { RenderOptions } from "@/lib/brush/engine";
import type { Ctx2D } from "@backends/utils/canvas";
import { createLayer, get2D } from "@backends/utils/canvas";
import {
  spacingToStepPx,
  resampleWithAngle,
  type SamplePoint,
} from "../core/resample";
import { clamp01 } from "../utils/color";

/** Optional shape for backendOverrides.stamping we care about here. */
type StampingBackendOverrides = {
  nibAngleDeg?: number; // 0..180, chisel-nib angle
};

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

  // Read nib angle from backendOverrides.stamping (variant-specific),
  // fall back to a sensible default if not provided.
  const stampingLocal = opt.engine.backendOverrides?.stamping as
    | StampingBackendOverrides
    | undefined;

  const nibAngleDeg =
    typeof stampingLocal?.nibAngleDeg === "number"
      ? stampingLocal.nibAngleDeg
      : 45;

  const rad = (nibAngleDeg * Math.PI) / 180;
  const ax = Math.cos(rad),
    ay = Math.sin(rad); // nib axis
  const nx = -ay,
    ny = ax; // orthogonal

  // Build quads (simple fat diamonds per sample)
  const quads: Array<
    [number, number, number, number, number, number, number, number]
  > = [];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const p = Math.pow(clamp01(s.p), 0.9);
    const width = baseR * 2 * (0.65 + 0.6 * p);

    const wx = width * 0.5 * ax;
    const wy = width * 0.5 * ay;

    const hx = width * 0.25 * nx;
    const hy = width * 0.25 * ny;

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
