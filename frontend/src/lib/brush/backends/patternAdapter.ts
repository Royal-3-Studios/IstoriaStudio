// FILE: src/lib/brush/backends/patternAdapter.ts

import renderPattern, { type PatternVariant } from "./pattern";

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
  EngineGrain,
} from "@/lib/brush/engine.types";

import { type Ctx2D, get2D } from "@backends/utils/canvas";
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

type PatternExtrasWide = Partial<RenderOverrides> &
  AdapterExtra & {
    baseSizePx?: number; // preferred
    sizePx?: number; // legacy alias
    streamline?: number; // → engine.strokePath.streamline
    grainKind?: "none" | "paper" | "canvas" | "noise";
    grainScale?: number; // 0.5..3
    grainRotate?: number; // degrees
    mode?: PatternVariant; // "stroke" | "fill" | "scatter"
  };

type EngineConfigWithPattern = EngineConfig & {
  backendOverrides?: {
    pattern?: { mode?: PatternVariant };
  };
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

/** Keep only keys whose value !== undefined (preserve 0/false/null). */
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

const DEFAULT_BASE = 14;

const patternAdapter: BackendAdapter = {
  id: "pattern",
  name: "pattern",
  caps: withBaseCaps({
    flow: true, // pattern fill honors flow/opacity if core uses it
    grainMotion: true, // backend respects grain motion routing
    tilt: true, // can rotate anisotropic pattern by tilt/direction
    worker: true, // OffscreenCanvas-safe
  }),

  async renderStroke(
    surface: CanvasSurface,
    opts: RenderStrokeOptions
  ): Promise<void> {
    const ctx: Ctx2D = get2D(surface);

    const width = Math.max(1, Math.floor(opts.width));
    const height = Math.max(1, Math.floor(opts.height));

    // Standardized extras bag (supports both new extra.* and legacy-on-root)
    const extra = (opts.extra ?? {}) as PatternExtrasWide;

    // New standardized locations
    const extraOverrides = (extra.overrides ?? {}) as Partial<RenderOverrides>;
    const extraStrokePath = (extra.strokePath ?? {}) as EngineStrokePath;

    // Legacy/compat fields on the extra root
    const {
      baseSizePx: extraBase,
      sizePx,
      streamline,
      grainKind,
      grainScale,
      grainRotate,
      mode,
      ...legacyOverridesAtRoot
    } = extra;

    // RenderOverrides (pruned)
    const overrides: Partial<RenderOverrides> = pruneUndefined<RenderOverrides>(
      {
        ...(legacyOverridesAtRoot as Partial<RenderOverrides>),
        ...extraOverrides,
      }
    );

    // Strict number for baseSizePx
    const baseSizePx: number = isFiniteNumber(opts.baseSizePx)
      ? opts.baseSizePx
      : isFiniteNumber(extraBase)
        ? extraBase
        : isFiniteNumber(sizePx)
          ? sizePx
          : DEFAULT_BASE;

    // StrokePath: attach only defined, placement-related keys
    const strokePath: EngineStrokePath = { ...extraStrokePath };
    if (isFiniteNumber(overrides.spacing))
      strokePath.spacing = overrides.spacing;
    if (isFiniteNumber(overrides.jitter)) strokePath.jitter = overrides.jitter;
    if (isFiniteNumber(overrides.scatter))
      strokePath.scatter = overrides.scatter;
    if (isFiniteNumber(overrides.count)) strokePath.count = overrides.count;
    if (isFiniteNumber(streamline)) strokePath.streamline = streamline;

    // Grain (prefer explicit extras; then fall back to overrides)
    const grain: Partial<EngineGrain> = {};
    if (typeof grainKind === "string") grain.kind = grainKind;
    if (isFiniteNumber(grainScale)) grain.scale = grainScale;
    if (isFiniteNumber(grainRotate)) grain.rotate = grainRotate;

    if (overrides.grainKind !== undefined && grain.kind === undefined)
      grain.kind = overrides.grainKind!;
    if (isFiniteNumber(overrides.grainScale) && grain.scale === undefined)
      grain.scale = overrides.grainScale!;
    if (isFiniteNumber(overrides.grainRotate) && grain.rotate === undefined)
      grain.rotate = overrides.grainRotate!;
    if (overrides.grainMotion !== undefined)
      grain.motion = overrides.grainMotion;
    if (isFiniteNumber(overrides.grainDepth))
      grain.depth = overrides.grainDepth!;

    // Base engine config (attach optional bags only when non-empty)
    const engineCfgBase: EngineConfig = { overrides };
    if (Object.keys(strokePath).length > 0)
      engineCfgBase.strokePath = strokePath;
    if (Object.keys(grain).length > 0)
      engineCfgBase.grain = grain as EngineGrain;

    // Attach backendOverrides.pattern.mode only if provided
    const engineCfg: EngineConfigWithPattern = { ...engineCfgBase };
    if (typeof mode === "string") {
      engineCfg.backendOverrides ??= {};
      engineCfg.backendOverrides.pattern ??= {};
      engineCfg.backendOverrides.pattern.mode = mode;
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
      // forward input so unified stabilization/prediction applies
      ...(opts.input ? { input: opts.input } : {}),
    };

    // Render selected variant (default decided in pattern/index)
    renderPattern(ctx, renderOpts, mode);
  },
};

export default patternAdapter;
