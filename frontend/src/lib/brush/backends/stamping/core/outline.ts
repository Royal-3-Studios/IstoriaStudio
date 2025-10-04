// FILE: src/lib/brush/backends/stamping/core/outline.ts
import type { SamplePoint } from "./resample";

/** Build a simple ribbon-like outline from resampled centerline + radiusAt(t). */
export function buildRibbonOutline(
  samples: ReadonlyArray<SamplePoint>,
  radiusAt: (t: number) => number
): Path2D {
  const n = samples.length;
  const left: Array<{ x: number; y: number }> = [];
  const right: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < n; i++) {
    const cur = samples[i]!;
    const prev = samples[Math.max(0, i - 1)] ?? cur;
    const next = samples[Math.min(n - 1, i + 1)] ?? cur;

    const ang = Math.atan2(next.y - prev.y, next.x - prev.x);
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    const r = Math.max(0, radiusAt(cur.t));

    left.push({ x: cur.x - nx * r, y: cur.y - ny * r });
    right.push({ x: cur.x + nx * r, y: cur.y + ny * r });
  }

  const p = new Path2D();
  p.moveTo(left[0]!.x, left[0]!.y);
  for (let i = 1; i < n; i++) p.lineTo(left[i]!.x, left[i]!.y);
  for (let i = n - 1; i >= 0; i--) p.lineTo(right[i]!.x, right[i]!.y);
  p.closePath();
  return p;
}
