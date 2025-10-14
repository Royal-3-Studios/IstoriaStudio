// FILE: src/lib/brush/engine/registry.ts

import type { EngineConfig } from "../engine.types";

/** Canvas surface the adapters can draw into. */
export type CanvasLike = OffscreenCanvas | HTMLCanvasElement;

/** Extra runtime inputs the engine provides when invoking a backend. */
export type EngineInvocation = {
  engine: EngineConfig;
  surface: { width: number; height: number; pixelRatio: number };
  path: Array<{
    x: number;
    y: number;
    pressure?: number; // alias: p
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
// If/when you implement these, switch the stubs below to real imports:
// import smudgeAdapter from "../backends/smudgeAdapter";
// import impastoAdapter from "../backends/impastoAdapter";
// import particleAdapter from "../backends/particleAdapter";

// Use the actual adapter options type to stay in sync with adapters.
import type {
  RenderStrokeOptions as AdapterRenderStrokeOptions,
  RenderStrokePoint,
  AdapterExtra,
} from "../backends/types";

/* ------------------------------ Normalizers ------------------------------- */

/** Clamp to [0..1], accommodating devices that report >1 ranges (e.g., 1024/4096). */
function normalizePressure(v: number | undefined): number {
  if (typeof v !== "number") return 1;
  const n = v <= 1 ? v : v / 4096;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** One-time path normalization: resolves `p|pressure` -> `pressure ∈ [0..1]`. */
function normalizePath(
  src: EngineInvocation["path"]
): ReadonlyArray<RenderStrokePoint> {
  return src.map<RenderStrokePoint>((pt) => {
    const p = typeof pt.p === "number" ? pt.p : pt.pressure;
    return {
      x: pt.x,
      y: pt.y,
      pressure: normalizePressure(p),
      ...(typeof pt.angle === "number" ? { angle: pt.angle } : {}),
      ...(typeof pt.tilt === "number" ? { tilt: pt.tilt } : {}),
      ...(typeof pt.t === "number" ? { t: pt.t } : {}),
    };
  });
}

/** Collect engine extras in a typed-friendly bag (omit if empty). */
function buildExtra(engine: EngineConfig): AdapterExtra | undefined {
  const extra: Record<string, unknown> = {};
  if (engine.overrides) extra.overrides = engine.overrides;
  if (engine.strokePath) extra.strokePath = engine.strokePath;
  if (engine.shape) extra.shape = engine.shape;
  if (engine.rendering) extra.rendering = engine.rendering;
  if (engine.grain) extra.grain = engine.grain;
  return Object.keys(extra).length > 0 ? (extra as AdapterExtra) : undefined;
}

// --- Strict mapper: EngineInvocation -> AdapterRenderStrokeOptions ----------
function toRenderStrokeOptions(
  inv: EngineInvocation
): AdapterRenderStrokeOptions {
  const {
    surface: { width, height, pixelRatio },
    path,
    seed,
    color,
    baseSizePx,
    engine,
  } = inv;

  const out: AdapterRenderStrokeOptions = {
    width,
    height,
    pixelRatio, // ✅ standardized key (not "dpr")
    seed: typeof seed === "number" ? seed : 0, // adapters can rely on a number
    path: normalizePath(path), // ✅ normalize p|pressure → pressure ∈ [0..1]
  };

  if (color !== undefined) out.color = color;
  if (baseSizePx !== undefined) out.baseSizePx = baseSizePx;

  const extra = buildExtra(engine);
  if (extra) out.extra = extra;

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
export const BACKEND_REGISTRY = {
  stamping: stampingRunner,
  ribbon: ribbonRunner,
  spray: sprayRunner,
  wet: wetRunner,
  pattern: patternRunner,

  smudge: smudgeRunner,
  impasto: impastoRunner,
  particle: particleRunner,
} as const;

export type BackendId = keyof typeof BACKEND_REGISTRY;

export function resolveBackend(name: string): BackendRunner {
  const fn = BACKEND_REGISTRY[name as BackendId];
  if (!fn) {
    const known = Object.keys(BACKEND_REGISTRY).join(", ");
    throw new Error(`Unknown backend "${name}". Known: ${known}`);
  }
  return fn;
}
