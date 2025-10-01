// FILE: src/lib/brush/engine/registry.ts

export type CanvasLike = OffscreenCanvas | HTMLCanvasElement;

/** Extra runtime inputs the engine provides when invoking a backend. */
export type EngineInvocation = {
  engine: EngineConfig;
  surface: { width: number; height: number; dpr: number };
  path: Array<{
    x: number;
    y: number;
    pressure?: number;
    p?: number;
    angle?: number;
    tilt?: number;
    t?: number;
  }>;
  seed?: number;
  color?: string;
  baseSizePx?: number;
};

export type BackendRunner = (
  canvas: CanvasLike,
  inv: EngineInvocation
) => Promise<void> | void;

// --- Import ADAPTERS (objects with renderStroke(..)) ------------------------
import stampingAdapter from "../backends/stampingAdapter";
import ribbonAdapter from "../backends/ribbonAdapter";
import sprayAdapter from "../backends/sprayAdapter";
import wetAdapter from "../backends/wetAdapter";
import patternAdapter from "../backends/patternAdapter";

// Use the actual adapter options type to stay in sync with adapters.
import type { RenderStrokeOptions as AdapterRenderStrokeOptions } from "../backends/types";
import type { EngineConfig } from "../engine.types";

// --- Strict mapper: EngineInvocation -> AdapterRenderStrokeOptions ----------
function toRenderStrokeOptions(
  inv: EngineInvocation
): AdapterRenderStrokeOptions {
  const {
    surface: { width, height, dpr },
    path,
    seed,
    color,
    baseSizePx,
    engine,
  } = inv;

  // Build only the required/defined fields (no undefineds).
  const out: AdapterRenderStrokeOptions = {
    width,
    height,
    dpr,
    seed: seed ?? 0, // <- required by adapters: guarantee a number
    path,
  };

  // Optional fields: assign only if defined
  if (color !== undefined) out.color = color;
  if (baseSizePx !== undefined) out.baseSizePx = baseSizePx;

  // Bundle relevant engine bits as "extra" only if we have something
  const extra: Record<string, unknown> = {};
  if (engine.overrides) extra.overrides = engine.overrides;
  if (engine.strokePath) extra.strokePath = engine.strokePath;
  if (engine.shape) extra.shape = engine.shape;
  if (engine.rendering) extra.rendering = engine.rendering;
  if (engine.grain) extra.grain = engine.grain;
  if (Object.keys(extra).length > 0) out.extra = extra;

  return out;
}

// --- Runners: call adapter.renderStroke(canvas, opts) -----------------------
const stampingRunner: BackendRunner = (canvas, inv) =>
  stampingAdapter.renderStroke(canvas, toRenderStrokeOptions(inv));

const ribbonRunner: BackendRunner = (canvas, inv) =>
  ribbonAdapter.renderStroke(canvas, toRenderStrokeOptions(inv));

const sprayRunner: BackendRunner = (canvas, inv) =>
  sprayAdapter.renderStroke(canvas, toRenderStrokeOptions(inv));

const wetRunner: BackendRunner = (canvas, inv) =>
  wetAdapter.renderStroke(canvas, toRenderStrokeOptions(inv));

const patternRunner: BackendRunner = (canvas, inv) =>
  patternAdapter.renderStroke(canvas, toRenderStrokeOptions(inv));

// --- Future-ready (stubs for now) ------------------------------------------
const smudgeRunner: BackendRunner = () => {
  throw new Error(
    'Backend "smudge" not implemented.\n' +
      "Add pickup/laydown pipeline (premultiplied alpha, source buffer choice, distance-based spacing)."
  );
};
const impastoRunner: BackendRunner = () => {
  throw new Error(
    'Backend "impasto" not implemented.\n' +
      "Pressure→height (document space), normals (Sobel/prefilter), lighting decoupled from color alpha."
  );
};
const particleRunner: BackendRunner = () => {
  throw new Error(
    'Backend "particle" not implemented.\n' +
      "Seeded RNG per stroke, per-distance emission, fixed-step integrator, alpha/overdraw clamps."
  );
};

// --- Registry ---------------------------------------------------------------
export const BACKEND_REGISTRY: Record<string, BackendRunner> = {
  stamping: stampingRunner,
  ribbon: ribbonRunner,
  spray: sprayRunner,
  wet: wetRunner,
  pattern: patternRunner,

  smudge: smudgeRunner,
  impasto: impastoRunner,
  particle: particleRunner,
};

export function resolveBackend(name: string): BackendRunner {
  const fn = BACKEND_REGISTRY[name];
  if (!fn) {
    const known = Object.keys(BACKEND_REGISTRY).join(", ");
    throw new Error(`Unknown backend "${name}". Known: ${known}`);
  }
  return fn;
}
