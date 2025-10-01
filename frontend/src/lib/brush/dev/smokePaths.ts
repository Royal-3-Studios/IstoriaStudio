// FILE: src/lib/brush/dev/smokePaths.ts
import type { RenderPathPoint } from "@/lib/brush/engine";

export type SmokePoint = { x: number; y: number; p?: number }; // p = pressure 0..1
export type SmokePath = { name: string; seed: number; points: SmokePoint[] };

function r(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s >>>= 0;
    s ^= s << 5;
    s >>>= 0;
    return (s >>> 0) / 0xffffffff;
  };
}

function arc(
  seed: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n: number
): SmokePoint[] {
  const rand = r(seed);
  const pts: SmokePoint[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 1.5 + 0.3;
    const x = cx + Math.cos(t) * rx + (rand() - 0.5) * 1.0;
    const y = cy + Math.sin(t) * ry + (rand() - 0.5) * 1.0;
    const p = 0.4 + 0.6 * (i / n);
    pts.push({ x, y, p });
  }
  return pts;
}

function zigzag(
  seed: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  k: number
): SmokePoint[] {
  const rand = r(seed);
  const pts: SmokePoint[] = [];
  for (let i = 0; i <= k; i++) {
    const t = i / k;
    const x = x0 + t * w + (rand() - 0.5) * 0.8;
    const y = y0 + (i % 2 === 0 ? 0 : h) + (rand() - 0.5) * 0.8;
    const p = 0.7 - 0.3 * Math.abs(0.5 - t) * 2;
    pts.push({ x, y, p });
  }
  return pts;
}

export const SMOKE_CANVAS_W = 512;
export const SMOKE_CANVAS_H = 384;

export const SMOKE_PATHS: SmokePath[] = [
  { name: "arc-soft", seed: 12345, points: arc(12345, 180, 160, 120, 80, 160) },
  {
    name: "zigzag-mid",
    seed: 314159,
    points: zigzag(314159, 40, 80, 420, 160, 36),
  },
  { name: "arc-tight", seed: 7777, points: arc(7777, 300, 200, 80, 50, 140) },
];

/** Convenience: pick the first as a “canned” default. */
export const cannedPath: SmokePath = SMOKE_PATHS[0];

/** Helper: convert SmokePoint[] → RenderPathPoint[] for backends. */
export function toRenderPath(points: readonly SmokePoint[]): RenderPathPoint[] {
  return points.map((p) => ({
    x: p.x,
    y: p.y,
    pressure: typeof p.p === "number" ? p.p : 0.7,
    // if your RenderPathPoint has more fields, add them here
  }));
}
