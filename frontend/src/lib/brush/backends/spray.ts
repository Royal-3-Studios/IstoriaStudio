// FILE: src/lib/brush/backends/spray.ts
/**
 * Spray backend (particles built from the stamping backend).
 * - Uses ctx-based stamping (default export from ./stamping)
 * - Jitters/scatters the path per particle
 * - Works with new stamping "paper tooth" pass automatically
 */

import type { RenderOptions, RenderPathPoint } from "@/lib/brush/engine";
import drawStamping from "./stamping"; // <-- ctx-based default export

/* ---------------- RNG ---------------- */
function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Approx normal from two uniforms
function randNormal(r: () => number) {
  return r() + r() - 1 + (r() + r() - 1); // sum of 4 uniforms -> ~N(0, ~0.66)
}

/* -------------- Jitter helpers -------------- */
function jitterPath(
  src: ReadonlyArray<RenderPathPoint>,
  rng: () => number,
  scatterPx: number
): RenderPathPoint[] {
  const out: RenderPathPoint[] = new Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const p = src[i];
    const jx = randNormal(rng) * scatterPx * 0.5;
    const jy = randNormal(rng) * scatterPx * 0.5;
    out[i] = { ...p, x: p.x + jx, y: p.y + jy };
  }
  return out;
}

/* -------------- Main -------------- */

export async function drawSprayToCanvas(
  canvas: HTMLCanvasElement,
  opt: RenderOptions
): Promise<void> {
  const path = opt.path ?? [];
  if (path.length < 2) return;

  const ctx = canvas.getContext("2d", { alpha: true })!;
  const stroke = opt.engine.strokePath ?? {};
  const ov = opt.engine.overrides ?? {};

  const count = Math.max(1, Math.round(stroke.count ?? ov.count ?? 12)) | 0;
  const scatterPx = Math.max(0, Number(stroke.scatter ?? ov.scatter ?? 24));
  const jitterPct = Math.max(0, Number(stroke.jitter ?? ov.jitter ?? 8)) / 100;

  const rng = makeRng((opt.seed ?? 42) ^ 0xbadc0de);

  // We render N lightly-jittered passes using the stamping backend.
  for (let i = 0; i < count; i++) {
    // Per-pass size wobble (subtle)
    const sizeWobble = 1 + (rng() - 0.5) * 0.25 * jitterPct; // up to ~±3%
    const jittered = scatterPx > 0 ? jitterPath(path, rng, scatterPx) : path;

    const derived: RenderOptions = {
      ...opt,
      // keep same canvas bounds/width/height
      baseSizePx: Math.max(1, opt.baseSizePx * sizeWobble),
      // important: feed the jittered path
      path: jittered,
      // ensure the stamping backend settings apply (rims, paper tooth, etc.)
      engine: {
        ...opt.engine,
        backend: "stamping",
      },
    };

    // stamping backend is ctx-based
    drawStamping(ctx, derived);
  }
}

export default drawSprayToCanvas;
