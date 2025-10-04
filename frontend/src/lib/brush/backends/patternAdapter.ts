// FILE: src/lib/brush/backends/patternAdapter.ts
import { drawPatternToCanvas } from "./pattern";
import type { PatternMode } from "./pattern";
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
  baseSizePx?: number; // preferred
  sizePx?: number; // legacy alias
  streamline?: number; // → engine.strokePath.streamline
  grainKind?: "none" | "paper" | "canvas" | "noise";
  grainScale?: number; // 0.5..3
  grainRotate?: number; // degrees
  mode?: PatternMode; // "stroke" | "fill" | "scatter"
};

type EngineConfigWithPattern = EngineConfig & {
  backendOverrides?: {
    pattern?: { mode?: PatternMode };
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

function pruneUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k in obj) {
    const v = obj[k];
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
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

function pickPixelRatio(opts: {
  pixelRatio?: number;
  dpr?: number;
}): number | undefined {
  if (isFiniteNumber(opts.pixelRatio)) return opts.pixelRatio;
  if (isFiniteNumber(opts.dpr)) return opts.dpr;
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

    const rawExtra: PatternExtras = (opts.extra ?? {}) as PatternExtras;

    const {
      baseSizePx: extraBase,
      sizePx,
      streamline,
      grainKind,
      grainScale,
      grainRotate,
      mode,
      ...restOverrides
    } = rawExtra;

    const overrides: Partial<RenderOverrides> = pruneUndefined<RenderOverrides>(
      restOverrides as Partial<RenderOverrides>
    );

    // ✅ FIX: Use ternaries so the type stays `number` (no `false` leaks)
    const baseSizePx: number = isFiniteNumber(opts.baseSizePx)
      ? opts.baseSizePx
      : isFiniteNumber(extraBase)
        ? extraBase
        : isFiniteNumber(sizePx)
          ? sizePx
          : 14;

    // StrokePath (only defined keys)
    const strokePath: EngineStrokePath = {};
    if (isFiniteNumber(overrides.spacing))
      strokePath.spacing = overrides.spacing!;
    if (isFiniteNumber(overrides.jitter)) strokePath.jitter = overrides.jitter!;
    if (isFiniteNumber(overrides.scatter))
      strokePath.scatter = overrides.scatter!;
    if (isFiniteNumber(overrides.count)) strokePath.count = overrides.count!;
    if (isFiniteNumber(streamline)) strokePath.streamline = streamline;

    // Grain (prefer local extras, fall back to overrides)
    const grain: EngineGrain = {};
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

    // Base engine config
    const engineCfgBase: EngineConfig = { overrides };
    if (Object.keys(strokePath).length > 0)
      engineCfgBase.strokePath = strokePath;
    if (Object.keys(grain).length > 0) engineCfgBase.grain = grain;

    // Attach backendOverrides.pattern.mode only if provided
    const engineCfg: EngineConfigWithPattern = { ...engineCfgBase };
    if (typeof mode === "string") {
      engineCfg.backendOverrides ??= {};
      engineCfg.backendOverrides.pattern ??= {};
      engineCfg.backendOverrides.pattern.mode = mode;
    }

    const prCandidate = pickPixelRatio(
      opts as { pixelRatio?: number; dpr?: number }
    );

    const renderOpts: RenderOptions = {
      engine: engineCfg,
      baseSizePx,
      width,
      height,
      seed: isFiniteNumber(opts.seed) ? opts.seed : 0,
      path: toEnginePath(opts.path),
      ...(typeof opts.color === "string" ? { color: opts.color } : {}),
      ...(isFiniteNumber(prCandidate) ? { pixelRatio: prCandidate } : {}),
    };

    await Promise.resolve(drawPatternToCanvas(surface, renderOpts));
  },
};

export default patternAdapter;
