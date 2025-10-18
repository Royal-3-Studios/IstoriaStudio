// FILE: src/lib/brush/backends/impastoAdapter.ts

import { drawToCanvas as drawImpastoToCanvas } from "./impasto";

import type {
  BackendAdapter,
  CanvasSurface,
  RenderStrokeOptions,
  AdapterExtra,
} from "@backends/types";

import type {
  RenderOptions,
  RenderPathPoint,
  RenderOverrides,
  EngineStrokePath,
  EngineConfig,
} from "@/lib/brush/engine.types";

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
  t?: number; // timestamp (optional)
};

type ImpastoExtrasWide = Partial<RenderOverrides> &
  AdapterExtra & {
    /** Convenience knobs accepted by this adapter (legacy-friendly). */
    baseSizePx?: number; // prefer this; falls back to sizePx
    sizePx?: number; // legacy alias
    /** Legacy one-offs (prefer extra.strokePath) */
    spacing?: number; // → EngineStrokePath.spacing
    streamline?: number; // → EngineStrokePath.streamline
    strokePath?: Partial<EngineStrokePath>;
    overrides?: Partial<RenderOverrides>;
  };

/* ================================= Helpers ================================= */

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function readPressure(pt: Pick<IncomingPoint, "p" | "pressure">): number {
  if (isFiniteNumber(pt.p)) return pt.p;
  if (isFiniteNumber(pt.pressure)) return pt.pressure;
  return 0.7;
}

/** Keep only keys with value !== undefined (preserve 0/false/null). */
function pruneUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k in obj) if (obj[k] !== undefined) out[k] = obj[k];
  return out as Partial<T>;
}

/** Normalize external path → engine path (duplicate pressure into p & pressure). */
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

/** Strip placement/spacing keys from overrides (they belong in strokePath). */
function stripPlacementKeys(
  ov: Partial<RenderOverrides>
): Partial<RenderOverrides> {
  const {
    spacing,
    jitter,
    scatter,
    count,
    // not in overrides normally, but just in case:
    streamline,
    ...rest
  } = ov as Partial<RenderOverrides> & { streamline?: number };
  return rest;
}

/* ================================= Adapter ================================= */

const DEFAULT_BASE_SIZE = 12;
const DEFAULT_COLOR = "#46A0FF";
const DEFAULT_SPACING = 6;

const impastoAdapter: BackendAdapter = {
  id: "impasto",
  name: "impasto",
  caps: withBaseCaps({
    flow: true, // laydown amount before lighting
    tilt: true, // can steer bristle/knife direction
    rotation: true,
    heightfield: true,
    lighting: true, // uses height/normal & lights
    worker: true, // OffscreenCanvas-safe
  }),

  async renderStroke(
    surface: CanvasSurface,
    opts: RenderStrokeOptions
  ): Promise<void> {
    const width = Math.max(1, Math.floor(opts.width));
    const height = Math.max(1, Math.floor(opts.height));

    // Ensure there is a 2D context available (throws if not)
    get2D(surface);

    // Standardized extras (supports new extra.* and legacy fields on root)
    const extra = (opts.extra ?? {}) as ImpastoExtrasWide;

    const extraOverrides = (extra.overrides ?? {}) as Partial<RenderOverrides>;
    const extraStrokePath = (extra.strokePath ??
      {}) as Partial<EngineStrokePath>;

    const {
      baseSizePx: extraBase,
      sizePx, // legacy alias
      spacing, // legacy shortcut to strokePath.spacing
      streamline, // legacy shortcut to strokePath.streamline
      ...legacyOverridesAtRoot
    } = extra;

    // Merge overrides (but strip placement keys; we'll push those to strokePath)
    const mergedOverrides = pruneUndefined<RenderOverrides>({
      ...(legacyOverridesAtRoot as Partial<RenderOverrides>),
      ...extraOverrides,
    });
    const overrides: Partial<RenderOverrides> =
      stripPlacementKeys(mergedOverrides);

    // Base diameter — strictly number via ternaries
    const baseSizePx: number = isFiniteNumber(opts.baseSizePx)
      ? opts.baseSizePx
      : isFiniteNumber(extraBase)
        ? extraBase
        : isFiniteNumber(sizePx)
          ? sizePx
          : DEFAULT_BASE_SIZE;

    // Build strokePath (merge standardized bag first; add compat fields)
    const strokePath: EngineStrokePath = { ...extraStrokePath };
    if (isFiniteNumber(spacing)) strokePath.spacing = spacing; // compat
    // If caller slipped spacing/jitter/scatter/count into overrides, prefer strokePath
    const maybe = mergedOverrides as Partial<RenderOverrides> & {
      spacing?: number;
      jitter?: number;
      scatter?: number;
      count?: number;
    };
    if (isFiniteNumber(maybe.spacing)) strokePath.spacing = maybe.spacing;
    if (isFiniteNumber(maybe.jitter)) strokePath.jitter = maybe.jitter;
    if (isFiniteNumber(maybe.scatter)) strokePath.scatter = maybe.scatter;
    if (isFiniteNumber(maybe.count)) strokePath.count = maybe.count;
    if (isFiniteNumber(streamline)) strokePath.streamline = streamline; // compat

    // Default spacing if nothing set (impasto needs consistent stepping)
    if (!isFiniteNumber(strokePath.spacing)) {
      strokePath.spacing = DEFAULT_SPACING;
    }

    // Final RenderOptions
    const engineCfg: EngineConfig = { overrides };
    if (Object.keys(strokePath).length > 0)
      engineCfg.strokePath = strokePath as EngineStrokePath;

    const renderOpts: RenderOptions = {
      engine: engineCfg,
      baseSizePx,
      width,
      height,
      seed: isFiniteNumber(opts.seed) ? opts.seed : 0,
      path: toEnginePath(opts.path),
      color: typeof opts.color === "string" ? opts.color : DEFAULT_COLOR,
      ...(isFiniteNumber(opts.pixelRatio)
        ? { pixelRatio: opts.pixelRatio }
        : {}),
      ...(opts.input ? { input: opts.input } : {}),
    };

    await Promise.resolve(drawImpastoToCanvas(surface, renderOpts));
  },
};

export default impastoAdapter;
