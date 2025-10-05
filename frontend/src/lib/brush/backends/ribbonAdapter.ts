// FILE: src/lib/brush/backends/ribbonAdapter.ts
import type { BackendAdapter, RenderStrokeOptions } from "./types";
import type { RibbonMode } from "./ribbon";
import type {
  RenderOptions,
  RenderOverrides,
  EngineConfig,
  EngineStrokePath,
} from "@/lib/brush/engine";
import { drawToCanvas as drawRibbonToCanvas } from "./ribbon";
import { toEnginePath, pickPixelRatio, isFiniteNumber } from "./normalize";
import { hasColor, hasPixelRatio, hasDpr, hasInput } from "../utils/typing";

type EngineConfigWithRibbon = EngineConfig & {
  backendOverrides?: {
    ribbon?: { mode?: "pencil" | "ink" | "calligraphy" };
  };
};

type RibbonExtras = Partial<RenderOverrides> & {
  baseSizePx?: number;
  sizePx?: number; // legacy alias
  streamline?: number; // route to EngineStrokePath.streamline
  mode?: RibbonMode;
};

function pruneUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k in obj) {
    const v = obj[k];
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

/** Narrow RibbonMode to the engine-accepted set. */
type EngineRibbonMode = "pencil" | "ink" | "calligraphy";
function toEngineRibbonMode(
  m: RibbonMode | undefined
): EngineRibbonMode | undefined {
  return m === "pencil" || m === "ink" || m === "calligraphy" ? m : undefined;
}

const ribbonAdapter: BackendAdapter = {
  id: "ribbon",
  name: "ribbon",

  async renderStroke(surface, opts: RenderStrokeOptions): Promise<void> {
    const width = Math.max(1, Math.floor(opts.width));
    const height = Math.max(1, Math.floor(opts.height));

    const rawExtra: RibbonExtras = (opts.extra ?? {}) as RibbonExtras;
    const {
      baseSizePx: extraBase,
      sizePx,
      streamline,
      mode, // keep local, we’ll narrow below
      ...restOverrides
    } = rawExtra;

    const overrides: Partial<RenderOverrides> = pruneUndefined<RenderOverrides>(
      restOverrides as Partial<RenderOverrides>
    );

    const baseSizePx: number = isFiniteNumber(opts.baseSizePx)
      ? opts.baseSizePx
      : isFiniteNumber(extraBase)
        ? extraBase
        : isFiniteNumber(sizePx)
          ? sizePx
          : 14;

    const strokePath: EngineStrokePath = {};
    if (isFiniteNumber(overrides.spacing))
      strokePath.spacing = overrides.spacing!;
    if (isFiniteNumber(overrides.jitter)) strokePath.jitter = overrides.jitter!;
    if (isFiniteNumber(overrides.scatter))
      strokePath.scatter = overrides.scatter!;
    if (isFiniteNumber(overrides.count)) strokePath.count = overrides.count!;
    if (isFiniteNumber(streamline)) strokePath.streamline = streamline;

    const engineCfgBase: EngineConfig = { overrides };
    if (Object.keys(strokePath).length > 0)
      engineCfgBase.strokePath = strokePath;

    // Attach backendOverrides.ribbon.mode only if it matches engine’s accepted union
    const engineCfg: EngineConfigWithRibbon = { ...engineCfgBase };
    const engineMode = toEngineRibbonMode(mode);
    if (engineMode) {
      engineCfg.backendOverrides ??= {};
      engineCfg.backendOverrides.ribbon ??= {};
      engineCfg.backendOverrides.ribbon.mode = engineMode;
    }

    // Compute pixel ratio candidate once
    const prCandidate = hasPixelRatio(opts)
      ? opts.pixelRatio
      : hasDpr(opts)
        ? opts.dpr
        : pickPixelRatio(opts);

    // Build RenderOptions (use engineCfg that includes ribbon override)
    const renderOpts: RenderOptions = {
      engine: engineCfg,
      baseSizePx,
      width,
      height,
      seed: isFiniteNumber(opts.seed) ? opts.seed : 0,
      path: toEnginePath(opts.path),

      ...(hasColor(opts) ? { color: opts.color } : {}),
      ...(isFiniteNumber(prCandidate) ? { pixelRatio: prCandidate } : {}),
      ...(hasInput(opts) ? { input: opts.input } : {}),
    };

    await Promise.resolve(drawRibbonToCanvas(surface, renderOpts));
  },
};

export default ribbonAdapter;
