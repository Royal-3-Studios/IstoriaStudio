// FILE: src/lib/brush/backends/patternAdapter.ts
import type {
  BackendAdapter,
  RenderStrokeOptions,
  CanvasSurface,
} from "./types";
import type {
  RenderOptions,
  RenderPathPoint,
  RenderOverrides,
  EngineConfig,
  EngineStrokePath,
  EngineGrain,
} from "@/lib/brush/engine";
import { drawPatternToCanvas } from "./pattern";

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

type PatternExtras = Partial<RenderOverrides> & {
  /** Convenience knobs accepted by this adapter. */
  baseSizePx?: number; // prefer this; falls back to sizePx
  sizePx?: number; // legacy alias

  /** StrokePath convenience (if you want to drive from extras). */
  streamline?: number; // routes to engine.strokePath.streamline

  /** Grain routing (pattern.ts may read engine.grain). */
  grainKind?: "none" | "paper" | "canvas" | "noise";
  grainScale?: number; // 0.5..3
  grainRotate?: number; // degrees
};

/* ================================= Helpers ================================= */

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function readPressure(pt: Pick<IncomingPoint, "p" | "pressure">): number {
  if (isFiniteNumber(pt.p)) return pt.p;
  if (isFiniteNumber(pt.pressure)) return pt.pressure;
  return 0.7; // sensible default for previews/tests
}

// Remove keys whose value is strictly undefined (for exactOptionalPropertyTypes)
function pruneUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k in obj) {
    const v = obj[k];
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

// Normalize external path → engine path (omit undefined optionals)
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

function pickPixelRatio(opts: {
  pixelRatio?: number;
  dpr?: number;
}): number | undefined {
  if (isFiniteNumber(opts.pixelRatio)) return opts.pixelRatio;
  if (isFiniteNumber(opts.dpr)) return opts.dpr; // legacy alias
  return undefined;
}

/* ================================= Adapter ================================= */

const patternAdapter: BackendAdapter = {
  id: "pattern",
  name: "pattern",

  async renderStroke(
    surface: CanvasSurface,
    opts: RenderStrokeOptions
  ): Promise<void> {
    const width = Math.max(1, Math.floor(opts.width));
    const height = Math.max(1, Math.floor(opts.height));

    // Narrow extras to a typed surface
    const rawExtra: PatternExtras = (opts.extra ?? {}) as PatternExtras;

    // Peel off convenience keys; keep the rest as typed overrides and prune undefineds
    const {
      baseSizePx: extraBase,
      sizePx,
      streamline,
      grainKind,
      grainScale,
      grainRotate,
      ...restOverrides
    } = rawExtra;

    const overrides: Partial<RenderOverrides> = pruneUndefined<RenderOverrides>(
      restOverrides as Partial<RenderOverrides>
    );

    // Base diameter (with convenience fallbacks)
    const baseSizePx = isFiniteNumber(opts.baseSizePx)
      ? opts.baseSizePx
      : isFiniteNumber(extraBase)
        ? extraBase
        : isFiniteNumber(sizePx)
          ? sizePx
          : 14;

    // Build strokePath conditionally (avoid undefined writes)
    const strokePath: EngineStrokePath = {};
    if (isFiniteNumber(overrides.spacing))
      strokePath.spacing = overrides.spacing!;
    if (isFiniteNumber(overrides.jitter)) strokePath.jitter = overrides.jitter!;
    if (isFiniteNumber(overrides.scatter))
      strokePath.scatter = overrides.scatter!;
    if (isFiniteNumber(overrides.count)) strokePath.count = overrides.count!;
    if (isFiniteNumber(streamline)) strokePath.streamline = streamline;

    // Grain routing: add only defined fields
    const grain: EngineGrain = {};
    if (grainKind ?? overrides.grainKind)
      grain.kind = (grainKind ?? overrides.grainKind)!;
    if (isFiniteNumber(grainScale)) grain.scale = grainScale;
    else if (isFiniteNumber(overrides.grainScale))
      grain.scale = overrides.grainScale!;
    if (isFiniteNumber(grainRotate)) grain.rotate = grainRotate;
    else if (isFiniteNumber(overrides.grainRotate))
      grain.rotate = overrides.grainRotate!;
    if (overrides.grainMotion !== undefined)
      grain.motion = overrides.grainMotion;
    if (isFiniteNumber(overrides.grainDepth))
      grain.depth = overrides.grainDepth!;

    // Engine config: attach optionals only if non-empty
    const engineCfg: EngineConfig = { overrides };
    if (Object.keys(strokePath).length > 0) engineCfg.strokePath = strokePath;
    if (Object.keys(grain).length > 0) engineCfg.grain = grain;

    // Precompute pixel ratio candidate (pixelRatio -> dpr -> undefined)
    const prCandidate = pickPixelRatio(opts);

    // Final RenderOptions (single expression, no undefined writes)
    const renderOpts: RenderOptions = {
      engine: engineCfg,
      baseSizePx,
      width,
      height,
      seed: isFiniteNumber(opts.seed) ? opts.seed : 0,
      path: toEnginePath(opts.path),
      ...(typeof opts.color === "string" ? { color: opts.color } : {}),
      ...(isFiniteNumber(prCandidate) ? { pixelRatio: prCandidate } : {}),
      // Forward input only if your RenderStrokeOptions includes it and it's defined:
      // ...("input" in opts && opts.input ? { input: opts.input } : {}),
    };

    await Promise.resolve(drawPatternToCanvas(surface, renderOpts));
  },
};

export default patternAdapter;
