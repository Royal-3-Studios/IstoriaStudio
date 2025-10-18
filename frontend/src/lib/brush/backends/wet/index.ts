// FILE: src/lib/brush/backends/wet/index.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import { type CanvasLike } from "@backends/utils/canvas";
import drawWetToCanvas from "./core/wet";
import type { WetOptions } from "./types";

// Build WetOptions from engine config/overrides
export function buildWetOptions(opt: RenderOptions): WetOptions {
  const wet = opt.engine.backendOverrides?.wet ?? {};
  const ov = opt.engine.overrides ?? {};

  const flow01 = Math.min(
    1,
    Math.max(0, ((ov.flow as number | undefined) ?? 100) / 100)
  );
  const opacity01 = Math.min(
    1,
    Math.max(0, ((ov.opacity as number | undefined) ?? 100) / 100)
  );

  return {
    spacingPercent:
      (opt.engine.strokePath?.spacing as number | undefined) ??
      (ov.spacing as number | undefined) ??
      7,
    jitterPercent:
      (((opt.engine.strokePath?.jitter ??
        (ov.jitter as number | undefined) ??
        0) as number) *
        100) |
      0,
    scatterPx:
      (opt.engine.strokePath?.scatter as number | undefined) ??
      (ov.scatter as number | undefined) ??
      0,
    streamline: (opt.engine.strokePath?.streamline as number | undefined) ?? 0,

    diffusion: Math.max(0, (wet as any).diffusion ?? 0.8),
    pooling: Math.max(0, (wet as any).pooling ?? 0.35),
    pickup: Math.max(0, (wet as any).pickup ?? 0.15),
    wetEdges: Boolean((wet as any).wetEdges ?? true),
    edgeGain: Math.max(0, (wet as any).edgeGain ?? 0.45),
    edgeRadiusPx: Math.max(0.25, (wet as any).edgeRadiusPx ?? 1.2),
    granulation: Math.min(1, Math.max(0, (wet as any).granulation ?? 0.25)),

    iterations: Math.max(0, (wet as any).iterations ?? 2),
    stepPx: Math.max(1, (wet as any).stepPx ?? 2),

    flow01,
    opacity01,
  };
}

/** Core entry — unified wet rendering (wash + optional edges/diffusion/lift). */
export default function draw(_ctxIgnored: unknown, opt: RenderOptions): void {
  const wet = buildWetOptions(opt);
  drawWetToCanvas(opt as unknown as CanvasLike, opt.path ?? [], {
    ...opt,
    wet,
  });
}

/** Convenience: accept a canvas surface and draw. */
export function drawToCanvas(surface: CanvasLike, opt: RenderOptions): void {
  const wet = buildWetOptions(opt);
  drawWetToCanvas(surface, opt.path ?? [], { ...opt, wet });
}
