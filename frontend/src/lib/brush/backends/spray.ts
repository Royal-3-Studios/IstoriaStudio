// src/lib/brush/backends/spray.ts
/**
 * Spray backend: thin wrapper around stamping with high scatter/count
 * and smaller tips. Keeps code small while unlocking airbrush behavior.
 */

import type { RenderOptions } from "../engine";
import { drawStampingToCanvas as drawStamping } from "./stamping";

export async function drawSprayToCanvas(
  canvas: HTMLCanvasElement,
  opt: RenderOptions
): Promise<void> {
  // Derive spray-friendly defaults but respect user overrides
  const derived: RenderOptions = {
    ...opt,
    baseSizePx: Math.max(2, (opt.baseSizePx || 8) * 0.6), // smaller dots
    engine: {
      ...opt.engine,
      strokePath: {
        ...(opt.engine?.strokePath ?? {}),
        spacing: opt.overrides?.spacing ?? opt.engine?.strokePath?.spacing ?? 6,
        jitter: opt.overrides?.jitter ?? opt.engine?.strokePath?.jitter ?? 40,
        scatter:
          opt.overrides?.scatter ?? opt.engine?.strokePath?.scatter ?? 18,
        count: opt.overrides?.count ?? opt.engine?.strokePath?.count ?? 18,
      },
      shape: {
        ...(opt.engine?.shape ?? {}),
        roundness: opt.engine?.shape?.roundness ?? 100,
        softness: opt.overrides?.softness ?? opt.engine?.shape?.softness ?? 60,
        angle: opt.overrides?.angle ?? opt.engine?.shape?.angle ?? 0,
      },
    },
    overrides: {
      ...opt.overrides,
      flow: opt.overrides?.flow ?? 30, // lighter by default
    },
  };

  await drawStamping(canvas, derived);
}

export default drawSprayToCanvas;
