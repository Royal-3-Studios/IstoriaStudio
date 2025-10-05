// FILE: src/lib/brush/backends/stamping/stampingAdapter.ts

import type {
  RenderOptions,
  RenderPathPoint,
  RenderOverrides,
  EngineConfig,
  EngineStrokePath,
} from "@/lib/brush/engine.types"; // <- use the canonical types module you settled on

import drawStamping from "./stamping";

import type {
  RenderStrokeOptions,
  BackendAdapter,
  CanvasSurface,
} from "@backends/types"; // <- import from the shared types module

import { get2D } from "@backends/utils/canvas"; // <- use the typed 2D getter

/* ============================ Local helper types ============================ */

type IncomingPoint = {
  x: number;
  y: number;
  p?: number;
  pressure?: number;
  angle?: number;
  tilt?: number;
  t?: number;
};

type StampingExtras = Partial<RenderOverrides> & {
  baseSizePx?: number;
  sizePx?: number;
  streamline?: number;
  /** Optional variant mode requested by the caller (wide). */
  mode?:
    | "graphite"
    | "ink"
    | "marker"
    | "calligraphy"
    | "scatter"
    | "stamp"
    | "ornament";
};

/** The *engine-accepted* narrow union for stamping mode. Adjust to your engine. */
type EngineStampingMode = "graphite" | "ink";

/* ================================= Helpers ================================= */

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function readPressure(pt: Pick<IncomingPoint, "p" | "pressure">): number {
  if (isFiniteNumber(pt.p)) return pt.p;
  if (isFiniteNumber(pt.pressure)) return pt.pressure;
  return 1; // firm default
}

function toEnginePath(path?: RenderStrokeOptions["path"]): RenderPathPoint[] {
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

/** Narrow the wide caller mode to the engine-supported union. */
function toEngineStampingMode(
  m: StampingExtras["mode"]
): EngineStampingMode | undefined {
  return m === "graphite" || m === "ink" ? m : undefined;
}

/* ================================ Adapter ================================= */

const stampingAdapter: BackendAdapter = {
  id: "stamping",
  name: "stamping",

  async renderStroke(
    surface: CanvasSurface,
    opts: RenderStrokeOptions
  ): Promise<void> {
    const width = Math.max(1, Math.floor(opts.width));
    const height = Math.max(1, Math.floor(opts.height));

    const rawExtra: StampingExtras = (opts.extra ?? {}) as StampingExtras;
    const {
      baseSizePx: extraBase,
      sizePx,
      streamline,
      mode, // wide
      ...restOverrides
    } = rawExtra;

    const overrides: Partial<RenderOverrides> = { ...restOverrides };

    const baseSizePx = isFiniteNumber(opts.baseSizePx)
      ? opts.baseSizePx
      : isFiniteNumber(extraBase)
        ? extraBase
        : isFiniteNumber(sizePx)
          ? sizePx
          : 12;

    const strokePath: EngineStrokePath = {};
    if (isFiniteNumber(overrides.spacing))
      strokePath.spacing = overrides.spacing;
    if (isFiniteNumber(overrides.jitter)) strokePath.jitter = overrides.jitter;
    if (isFiniteNumber(overrides.scatter))
      strokePath.scatter = overrides.scatter;
    if (isFiniteNumber(overrides.count)) strokePath.count = overrides.count;
    if (isFiniteNumber(streamline)) strokePath.streamline = streamline;

    // Base engine config (omit empties)
    const engineCfg: EngineConfig & {
      backendOverrides?: { stamping?: { mode?: EngineStampingMode } };
    } = { overrides };
    if (Object.keys(strokePath).length > 0) engineCfg.strokePath = strokePath;

    // Only forward mode when it matches the engine’s accepted set
    const narrowed = toEngineStampingMode(mode);
    if (narrowed) {
      engineCfg.backendOverrides ??= {};
      engineCfg.backendOverrides.stamping ??= {};
      engineCfg.backendOverrides.stamping.mode = narrowed;
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
    };

    // ✅ Strongly-typed 2D context (CanvasRenderingContext2D or OffscreenCanvasRenderingContext2D)
    const ctx = get2D(surface);
    drawStamping(ctx, renderOpts);
  },
};

export default stampingAdapter;
