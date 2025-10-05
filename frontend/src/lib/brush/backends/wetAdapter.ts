// FILE: src/lib/brush/backends/wetAdapter.ts
import type { BackendAdapter, RenderStrokeOptions } from "./types";
import type {
  RenderOptions,
  RenderPathPoint,
  RenderOverrides,
  EngineConfig,
  EngineStrokePath,
} from "@/lib/brush/engine";
import { drawToCanvas as drawWetToCanvas } from "./wet";

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

type WetExtras = Partial<RenderOverrides> & {
  baseSizePx?: number; // allow passing base size via extra
  sizePx?: number; // legacy alias
  streamline?: number; // route to EngineStrokePath.streamline
  wetEdges?: boolean; // optionally route into engine.rendering.wetEdges
};

/* ================================= Helpers ================================= */

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function readPressure(pt: Pick<IncomingPoint, "p" | "pressure">): number {
  if (isFiniteNumber(pt.p)) return pt.p;
  if (isFiniteNumber(pt.pressure)) return pt.pressure;
  return 1; // default to firm press
}

// Remove keys whose value is strictly undefined (to satisfy exactOptionalPropertyTypes)
function pruneUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k in obj) {
    const v = obj[k];
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

// Normalize external path → engine path (omit undefined optionals)
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

  async renderStroke(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    opts: RenderStrokeOptions
  ): Promise<void> {
    const width = Math.max(1, Math.floor(opts.width));
    const height = Math.max(1, Math.floor(opts.height));

    // Narrow `extra` to a typed surface
    const rawExtra: WetExtras = (opts.extra ?? {}) as WetExtras;

    // Peel off special keys; keep the rest as overrides, then prune undefineds
    const {
      baseSizePx: extraBase,
      sizePx,
      streamline,
      wetEdges,
      ...restOverrides
    } = rawExtra;

    const overrides: Partial<RenderOverrides> = pruneUndefined<RenderOverrides>(
      restOverrides as Partial<RenderOverrides>
    );

    // Base size selection
    const baseSizePx = isFiniteNumber(extraBase)
      ? extraBase
      : isFiniteNumber(sizePx)
        ? sizePx
        : 12;

    // Build strokePath conditionally (avoid setting any key to undefined)
    const strokePath: EngineStrokePath = {};
    if (isFiniteNumber(overrides.spacing))
      strokePath.spacing = overrides.spacing!;
    if (isFiniteNumber(overrides.jitter)) strokePath.jitter = overrides.jitter!;
    if (isFiniteNumber(overrides.scatter))
      strokePath.scatter = overrides.scatter!;
    if (isFiniteNumber(overrides.count)) strokePath.count = overrides.count!;
    if (isFiniteNumber(streamline)) strokePath.streamline = streamline;

    // Optionally propagate wetEdges to engine.rendering
    const rendering: EngineConfig["rendering"] | undefined =
      typeof wetEdges === "boolean" ? { wetEdges } : undefined;

    // Build engine config, omitting empty optionals (exactOptionalPropertyTypes-safe)
    const engineCfg: EngineConfig = { overrides };
    if (Object.keys(strokePath).length > 0) engineCfg.strokePath = strokePath;
    if (rendering) engineCfg.rendering = rendering;

    const renderOpts: RenderOptions = {
      engine: engineCfg,
      baseSizePx,
      width,
      height,
      seed: isFiniteNumber(opts.seed) ? opts.seed : 0,
      path: toEnginePath(opts.path),
      // If your backend honors these, you can forward them:
      // color: opts.color,
      // pixelRatio: opts.dpr, // or opts.pixelRatio, depending on your RenderStrokeOptions
      // input: opts.input,
    };

    await Promise.resolve(drawWetToCanvas(canvas, renderOpts));
  },
};

export default wetAdapter;
