// FILE: src/lib/brush/backends/wetAdapter.ts

import type {
  BackendAdapter,
  RenderStrokeOptions,
  CanvasSurface,
  AdapterExtra,
} from "@backends/types";

import type {
  RenderOptions,
  RenderPathPoint,
  RenderOverrides,
  EngineConfig,
  EngineStrokePath,
} from "@/lib/brush/engine.types";

import { drawToCanvas as drawWetToCanvas } from "./wet";
import { get2D } from "@backends/utils/canvas";
import { withBaseCaps } from "@/lib/brush/backends/caps";

/* ============================ Local helper types ============================ */

type IncomingPoint = {
  x: number;
  y: number;
  p?: number; // shorthand pressure
  pressure?: number; // verbose pressure
  angle?: number;
  tilt?: number;
  t?: number; // optional timestamp
};

type WetExtrasWide = Partial<RenderOverrides> &
  AdapterExtra & {
    baseSizePx?: number; // preferred
    sizePx?: number; // legacy alias
    streamline?: number; // → EngineStrokePath.streamline
    wetEdges?: boolean; // optionally route into engine.rendering.wetEdges
  };

/* ================================= Helpers ================================= */

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function readPressure(pt: Pick<IncomingPoint, "p" | "pressure">): number {
  if (isFiniteNumber(pt.p)) return pt.p;
  if (isFiniteNumber(pt.pressure)) return pt.pressure;
  return 0.7; // consistent default with other adapters
}

/** Keep only defined fields (preserve 0/false/null). */
function pruneUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k in obj) if (obj[k] !== undefined) out[k] = obj[k];
  return out as Partial<T>;
}

/** Normalize external path → engine path (omit undefined optionals). */
function toEnginePath(path: RenderStrokeOptions["path"]): RenderPathPoint[] {
  const src = (path ?? []) as IncomingPoint[];
  return src.map((pt) => {
    const p = readPressure(pt);
    const out: RenderPathPoint = { x: pt.x, y: pt.y, p, pressure: p };
    if (isFiniteNumber(pt.angle)) out.angle = pt.angle;
    if (isFiniteNumber(pt.tilt)) out.tilt = pt.tilt;
    if (isFiniteNumber(pt.t)) out.t = pt.t;
    return out;
  });
}

/* ================================= Adapter ================================= */

const wetAdapter: BackendAdapter = {
  id: "wet",
  name: "wet",
  caps: withBaseCaps({
    wet: true,
    flow: true, // respects flow for laydown before diffusion
    tilt: true, // ready to bias diffusion/smudge by tilt if backend supports it
    worker: true, // OffscreenCanvas-safe
  }),

  async renderStroke(
    surface: CanvasSurface,
    opts: RenderStrokeOptions
  ): Promise<void> {
    const width = Math.max(1, Math.floor(opts.width));
    const height = Math.max(1, Math.floor(opts.height));

    // Ensure a valid 2D context exists (throws if not)
    get2D(surface);

    // Standardized extras (support new locations + legacy root fields)
    const extra = (opts.extra ?? {}) as WetExtrasWide;

    const extraOverrides = (extra.overrides ?? {}) as Partial<RenderOverrides>;
    const extraStrokePath = (extra.strokePath ?? {}) as EngineStrokePath;

    const {
      baseSizePx: extraBase,
      sizePx,
      streamline,
      wetEdges,
      ...legacyOverridesAtRoot
    } = extra;

    const overrides: Partial<RenderOverrides> = pruneUndefined<RenderOverrides>(
      {
        ...(legacyOverridesAtRoot as Partial<RenderOverrides>),
        ...extraOverrides,
      }
    );

    // Base size (strict number)
    const baseSizePx: number = isFiniteNumber(opts.baseSizePx)
      ? opts.baseSizePx
      : isFiniteNumber(extraBase)
        ? extraBase
        : isFiniteNumber(sizePx)
          ? sizePx
          : 12;

    // Build strokePath conditionally (avoid setting any key to undefined)
    const strokePath: EngineStrokePath = { ...extraStrokePath };
    if (isFiniteNumber(overrides.spacing))
      strokePath.spacing = overrides.spacing;
    if (isFiniteNumber(overrides.jitter)) strokePath.jitter = overrides.jitter;
    if (isFiniteNumber(overrides.scatter))
      strokePath.scatter = overrides.scatter;
    if (isFiniteNumber(overrides.count)) strokePath.count = overrides.count;
    if (isFiniteNumber(streamline)) strokePath.streamline = streamline;

    // Build engine config (omit empty optionals)
    const engineCfg: EngineConfig = { overrides };
    if (Object.keys(strokePath).length > 0) engineCfg.strokePath = strokePath;

    // Only assign rendering when we actually have a value (avoids EngineRendering|undefined)
    if (typeof wetEdges === "boolean") {
      engineCfg.rendering = {
        ...(engineCfg.rendering ?? {}),
        wetEdges,
      };
    }

    const renderOpts: RenderOptions = {
      engine: engineCfg,
      baseSizePx,
      width,
      height,
      seed: isFiniteNumber(opts.seed) ? opts.seed : 0,
      path: toEnginePath(opts.path),
      ...(typeof opts.color === "string" ? { color: opts.color } : {}),
      ...(isFiniteNumber(opts.pixelRatio)
        ? { pixelRatio: opts.pixelRatio }
        : {}),
      // Forward input so engine’s unified stabilization/prediction applies
      ...(opts.input ? { input: opts.input } : {}),
    };

    await Promise.resolve(drawWetToCanvas(surface, renderOpts));
  },
};

export default wetAdapter;
