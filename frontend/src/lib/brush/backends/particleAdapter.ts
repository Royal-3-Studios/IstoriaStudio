// FILE: src/lib/brush/backends/particleAdapter.ts

import drawParticle, { type ParticleMode } from "./particle"; // ./particle/index.ts

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
  t?: number; // timestamp
};

type ParticleExtrasWide = Partial<RenderOverrides> &
  AdapterExtra & {
    baseSizePx?: number;
    sizePx?: number; // legacy alias
    streamline?: number; // → strokePath.streamline
    mode?: ParticleMode; // "trail" | "smoke" | "sparkle"
  };

type EngineConfigWithParticle = EngineConfig & {
  backendOverrides?: { particle?: { mode?: ParticleMode } };
};

/* ================================= Helpers ================================= */

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function readPressure(pt: Pick<IncomingPoint, "p" | "pressure">): number {
  if (isFiniteNumber(pt.p)) return pt.p;
  if (isFiniteNumber(pt.pressure)) return pt.pressure;
  return 0.7; // sensible default for non-pressure inputs
}

/** Keep only defined fields (preserve 0/false/null). */
function pruneUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k in obj) if (obj[k] !== undefined) out[k] = obj[k];
  return out as Partial<T>;
}

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

const DEFAULT_BASE = 12;

const particleAdapter: BackendAdapter = {
  id: "particle",
  name: "particle",
  caps: withBaseCaps({
    flow: true, // alpha/ink amount honored for emission/opacity
    tilt: true, // set true if emission cone / physics uses tilt
    worker: true, // OffscreenCanvas-safe
  }),

  async renderStroke(
    surface: CanvasSurface,
    opts: RenderStrokeOptions
  ): Promise<void> {
    const width = Math.max(1, Math.floor(opts.width));
    const height = Math.max(1, Math.floor(opts.height));

    // Standardized extras
    const extra = (opts.extra ?? {}) as ParticleExtrasWide;

    const extraOverrides = (extra.overrides ?? {}) as Partial<RenderOverrides>;
    const extraStrokePath = (extra.strokePath ?? {}) as EngineStrokePath;

    const {
      baseSizePx: extraBase,
      sizePx,
      streamline,
      mode,
      ...legacyOverridesAtRoot
    } = extra;

    // Merge legacy root overrides with standardized overrides, pruning undefined
    const overrides: Partial<RenderOverrides> = pruneUndefined<RenderOverrides>(
      {
        ...(legacyOverridesAtRoot as Partial<RenderOverrides>),
        ...extraOverrides,
      }
    );

    // StrokePath (only defined keys)
    const strokePath: EngineStrokePath = { ...extraStrokePath };
    if (isFiniteNumber(overrides.spacing))
      strokePath.spacing = overrides.spacing;
    if (isFiniteNumber(overrides.jitter)) strokePath.jitter = overrides.jitter;
    if (isFiniteNumber(overrides.scatter))
      strokePath.scatter = overrides.scatter;
    if (isFiniteNumber(overrides.count)) strokePath.count = overrides.count;
    if (isFiniteNumber(streamline)) strokePath.streamline = streamline;

    // Build engine config (attach optional bags only when non-empty)
    const engineCfgBase: EngineConfig = { overrides };
    if (Object.keys(strokePath).length > 0)
      engineCfgBase.strokePath = strokePath;

    // Narrow backendOverrides typing (no `as` casts needed later)
    const engineCfg: EngineConfigWithParticle = { ...engineCfgBase };
    if (typeof mode === "string") {
      engineCfg.backendOverrides ??= {};
      engineCfg.backendOverrides.particle ??= {};
      engineCfg.backendOverrides.particle.mode = mode;
    }

    // Base diameter preference chain — strict number via ternaries
    const baseSizePx: number = isFiniteNumber(opts.baseSizePx)
      ? opts.baseSizePx
      : isFiniteNumber(extraBase)
        ? extraBase
        : isFiniteNumber(sizePx)
          ? sizePx
          : DEFAULT_BASE;

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

    // Resolve 2D context and delegate to particle/index
    const ctx = get2D(surface);
    drawParticle(ctx, renderOpts);
  },
};

export default particleAdapter;
