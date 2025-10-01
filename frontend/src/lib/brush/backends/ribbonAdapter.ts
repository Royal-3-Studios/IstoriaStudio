// FILE: src/lib/brush/backends/ribbonAdapter.ts
import type { BackendAdapter, RenderStrokeOptions } from "./types";
import type {
  RenderOptions,
  RenderOverrides,
  EngineConfig,
  EngineStrokePath,
} from "@/lib/brush/engine";
import { drawRibbonToCanvas } from "./ribbon";
import { toEnginePath, pickPixelRatio, isFiniteNumber } from "./normalize";
import { hasColor, hasPixelRatio, hasDpr, hasInput } from "../utils/typing";

type RibbonExtras = Partial<RenderOverrides> & {
  baseSizePx?: number;
  sizePx?: number; // legacy alias
  streamline?: number; // route to EngineStrokePath.streamline
};

function pruneUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k in obj) {
    const v = obj[k];
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
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
      ...restOverrides
    } = rawExtra;

    const overrides: Partial<RenderOverrides> = pruneUndefined<RenderOverrides>(
      restOverrides as Partial<RenderOverrides>
    );

    const baseSizePx = isFiniteNumber(opts.baseSizePx)
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

    const engineCfg: EngineConfig = { overrides };
    if (Object.keys(strokePath).length > 0) engineCfg.strokePath = strokePath;

    // Compute pixel ratio candidate once
    const prCandidate = hasPixelRatio(opts)
      ? opts.pixelRatio
      : hasDpr(opts)
        ? opts.dpr
        : pickPixelRatio(opts);

    // Build RenderOptions in one go (no undefined writes)
    const renderOpts: RenderOptions = {
      engine: engineCfg,
      baseSizePx,
      width,
      height,
      seed: isFiniteNumber(opts.seed) ? opts.seed : 0,
      path: toEnginePath(opts.path),

      // conditionally include optionals
      ...(hasColor(opts) ? { color: opts.color } : {}),
      ...(isFiniteNumber(prCandidate) ? { pixelRatio: prCandidate } : {}),
      ...(hasInput(opts) ? { input: opts.input } : {}),
    };

    await Promise.resolve(drawRibbonToCanvas(surface, renderOpts));
  },
};

export default ribbonAdapter;
