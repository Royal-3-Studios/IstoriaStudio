// FILE: src/lib/brush/backends/ribbonAdapter.ts
import type {
  BackendAdapter,
  RenderStrokeOptions,
  CanvasSurface,
  AdapterExtra,
} from "@backends/types";

import type { RibbonMode } from "./ribbon";

import type {
  RenderOptions,
  RenderOverrides,
  EngineConfig,
  EngineStrokePath,
  RenderPathPoint,
} from "@/lib/brush/engine.types";

import { drawToCanvas as drawRibbonToCanvas } from "./ribbon";
import { withBaseCaps } from "@/lib/brush/backends/caps";

/* ================================= Helpers ================================= */

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

type IncomingPoint = {
  x: number;
  y: number;
  p?: number;
  pressure?: number;
  angle?: number;
  tilt?: number;
  t?: number;
};

function readPressure(pt: Pick<IncomingPoint, "p" | "pressure">): number {
  if (isFiniteNumber(pt.p)) return pt.p;
  if (isFiniteNumber(pt.pressure)) return pt.pressure;
  return 0.7; // consistent default with other adapters
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

/** Remove only keys with `undefined` values (keeps 0/false/null). */
function pruneUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k in obj) if (obj[k] !== undefined) out[k] = obj[k];
  return out as Partial<T>;
}

/** Engine-accepted Ribbon modes (narrowed). */
type EngineRibbonMode = "pencil" | "ink" | "calligraphy";
function toEngineRibbonMode(
  m: RibbonMode | undefined
): EngineRibbonMode | undefined {
  return m === "pencil" || m === "ink" || m === "calligraphy" ? m : undefined;
}

/* ================================ Adapter extras ============================ */

type RibbonExtrasWide = Partial<RenderOverrides> &
  AdapterExtra & {
    baseSizePx?: number;
    sizePx?: number; // legacy alias
    streamline?: number; // → EngineStrokePath.streamline
    mode?: RibbonMode; // wide union; narrowed before passing to engine
  };

type EngineConfigWithRibbon = EngineConfig & {
  backendOverrides?: { ribbon?: { mode?: EngineRibbonMode } };
};

const DEFAULT_BASE_SIZE = 14;

// Capability flags: set only what’s truly supported.
const ribbonCaps = withBaseCaps({
  flow: true,
  tilt: true,
  angle: true,
  rotation: true,
  worker: true, // keep true only if OffscreenCanvas path is verified in this backend
});

/* ================================= Adapter ================================= */

const ribbonAdapter: BackendAdapter = {
  id: "ribbon",
  name: "ribbon",
  caps: ribbonCaps,

  async renderStroke(
    surface: CanvasSurface,
    opts: RenderStrokeOptions
  ): Promise<void> {
    const width = Math.max(1, Math.floor(opts.width));
    const height = Math.max(1, Math.floor(opts.height));

    const extra = (opts.extra ?? {}) as RibbonExtrasWide;

    // Standardized extras
    const extraOverrides = (extra.overrides ?? {}) as Partial<RenderOverrides>;
    const extraStrokePath = (extra.strokePath ?? {}) as EngineStrokePath;

    // Legacy/compat fields from extra root
    const {
      baseSizePx: extraBase,
      sizePx,
      streamline,
      mode,
      ...legacyOverridesAtRoot
    } = extra;

    const overrides = pruneUndefined<RenderOverrides>({
      ...(legacyOverridesAtRoot as Partial<RenderOverrides>),
      ...extraOverrides,
    });

    const baseSizePx: number = isFiniteNumber(opts.baseSizePx)
      ? opts.baseSizePx
      : isFiniteNumber(extraBase)
        ? extraBase
        : isFiniteNumber(sizePx)
          ? sizePx
          : DEFAULT_BASE_SIZE;

    // Compose strokePath from standardized bag + compat mappings
    const strokePath: EngineStrokePath = { ...extraStrokePath };
    if (isFiniteNumber(overrides.spacing))
      strokePath.spacing = overrides.spacing;
    if (isFiniteNumber(overrides.jitter)) strokePath.jitter = overrides.jitter;
    if (isFiniteNumber(overrides.scatter))
      strokePath.scatter = overrides.scatter;
    if (isFiniteNumber(overrides.count)) strokePath.count = overrides.count;
    if (isFiniteNumber(streamline)) strokePath.streamline = streamline;

    // Engine config
    const engineCfgBase: EngineConfig = { overrides };
    if (Object.keys(strokePath).length > 0)
      engineCfgBase.strokePath = strokePath;

    const engineCfg: EngineConfigWithRibbon = { ...engineCfgBase };
    const engineMode = toEngineRibbonMode(mode);
    if (engineMode) {
      engineCfg.backendOverrides ??= {};
      engineCfg.backendOverrides.ribbon ??= {};
      engineCfg.backendOverrides.ribbon.mode = engineMode;
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
      // 🔑 Forward input so engine’s unified stabilization/prediction applies:
      ...(opts.input ? { input: opts.input } : {}),
    };

    await Promise.resolve(drawRibbonToCanvas(surface, renderOpts));
  },
};

export default ribbonAdapter;
