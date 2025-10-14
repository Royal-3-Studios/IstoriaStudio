// FILE: src/lib/brush/backends/smudgeAdapter.ts
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

import drawSmudge from "./smudge"; // resolves to ./smudge/index.ts
import { get2D } from "@backends/utils/canvas";
import { withBaseCaps } from "@/lib/brush/backends/caps";

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

type SmudgeExtrasWide = Partial<RenderOverrides> &
  AdapterExtra & {
    baseSizePx?: number;
    sizePx?: number; // legacy alias
    spacing?: number; // legacy→ EngineStrokePath.spacing
    streamline?: number; // → EngineStrokePath.streamline
  };

/* ================================= Helpers ================================= */

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function readPressure(pt: Pick<IncomingPoint, "p" | "pressure">): number {
  if (isFiniteNumber(pt.p)) return pt.p;
  if (isFiniteNumber(pt.pressure)) return pt.pressure;
  return 0.7; // gentle default suits smudge
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

const SMUDGE_DEFAULT_BASE = 12;

const smudgeAdapter: BackendAdapter = {
  id: "smudge",
  name: "smudge",
  caps: withBaseCaps({
    flow: true, // pickup/laydown scaling
    tilt: true, // directional bias if core supports it
    smudge: true, // pickup/laydown pipeline
    worker: true, // OffscreenCanvas-safe
  }),

  async renderStroke(
    surface: CanvasSurface,
    opts: RenderStrokeOptions
  ): Promise<void> {
    const width = Math.max(1, Math.floor(opts.width));
    const height = Math.max(1, Math.floor(opts.height));

    const ctx = get2D(surface);

    // Standardized extras (support new locations + legacy root fields)
    const extra = (opts.extra ?? {}) as SmudgeExtrasWide;

    const extraOverrides = (extra.overrides ?? {}) as Partial<RenderOverrides>;
    const extraStrokePath = (extra.strokePath ?? {}) as EngineStrokePath;

    const {
      baseSizePx: extraBase,
      sizePx, // legacy alias
      spacing, // legacy/compat shortcut → strokePath.spacing
      streamline, // compat mapping → strokePath.streamline
      ...legacyOverridesAtRoot
    } = extra;

    const overrides: Partial<RenderOverrides> = pruneUndefined<RenderOverrides>(
      {
        ...(legacyOverridesAtRoot as Partial<RenderOverrides>),
        ...extraOverrides,
      }
    );

    // Strict baseSizePx
    const baseSizePx: number = isFiniteNumber(opts.baseSizePx)
      ? opts.baseSizePx
      : isFiniteNumber(extraBase)
        ? extraBase
        : isFiniteNumber(sizePx)
          ? sizePx
          : SMUDGE_DEFAULT_BASE;

    // Compose strokePath from standardized bag + compat mapping (omit undefineds)
    const strokePath: EngineStrokePath = { ...extraStrokePath };
    if (isFiniteNumber(spacing)) strokePath.spacing = spacing;
    if (isFiniteNumber(overrides.spacing))
      strokePath.spacing = overrides.spacing;
    if (isFiniteNumber(overrides.jitter)) strokePath.jitter = overrides.jitter;
    if (isFiniteNumber(overrides.scatter))
      strokePath.scatter = overrides.scatter;
    if (isFiniteNumber(overrides.count)) strokePath.count = overrides.count;
    if (isFiniteNumber(streamline)) strokePath.streamline = streamline;

    // Engine config
    const engineCfg: EngineConfig = { overrides };
    if (Object.keys(strokePath).length > 0) engineCfg.strokePath = strokePath;

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
      ...(opts.input ? { input: opts.input } : {}),
    };

    // drawSmudge is sync in most cases
    drawSmudge(ctx, renderOpts);
  },
};

export default smudgeAdapter;
