// FILE: src/lib/brush/backends/particleAdapter.ts
import drawParticle, { type ParticleMode } from "./particle"; // resolves to ./particle/index.ts

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
} from "@/lib/brush/engine";

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

type ParticleExtras = Partial<RenderOverrides> & {
  // Adapter convenience
  baseSizePx?: number;
  sizePx?: number; // legacy alias
  streamline?: number; // -> strokePath.streamline

  // Optional: choose variant in backend
  mode?: ParticleMode; // "trail" | "smoke" | "sparkle"
};

/* ================================ Helpers ================================== */

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function readPressure(pt: Pick<IncomingPoint, "p" | "pressure">): number {
  if (isFiniteNumber(pt.p)) return pt.p;
  if (isFiniteNumber(pt.pressure)) return pt.pressure;
  return 0.7; // sensible default for non-pressure inputs
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
  if (isFiniteNumber(opts.dpr)) return opts.dpr; // legacy alias
  return undefined;
}

/* ================================= Adapter ================================= */

const particleAdapter: BackendAdapter = {
  id: "particle",
  name: "particle",

  async renderStroke(
    surface: CanvasSurface,
    opts: RenderStrokeOptions
  ): Promise<void> {
    const width = Math.max(1, Math.floor(opts.width));
    const height = Math.max(1, Math.floor(opts.height));

    // Typed extras
    const rawExtra: ParticleExtras = (opts.extra ?? {}) as ParticleExtras;
    const {
      baseSizePx: extraBase,
      sizePx,
      streamline,
      mode,
      ...rest
    } = rawExtra;

    // RenderOverrides without undefined keys
    const overrides: Partial<RenderOverrides> = pruneUndefined<RenderOverrides>(
      rest as Partial<RenderOverrides>
    );

    // StrokePath (only defined keys)
    const strokePath: EngineStrokePath = {};
    if (isFiniteNumber(overrides.spacing))
      strokePath.spacing = overrides.spacing!;
    if (isFiniteNumber(overrides.jitter)) strokePath.jitter = overrides.jitter!;
    if (isFiniteNumber(overrides.scatter))
      strokePath.scatter = overrides.scatter!;
    if (isFiniteNumber(overrides.count)) strokePath.count = overrides.count!;
    if (isFiniteNumber(streamline)) strokePath.streamline = streamline;

    // Build engine config
    const engineCfg: EngineConfig = { overrides };
    if (Object.keys(strokePath).length > 0) engineCfg.strokePath = strokePath;

    // Forward backend-local mode safely (no `any`)
    if (typeof mode === "string") {
      engineCfg.backendOverrides ??= {};
      (
        engineCfg.backendOverrides as { particle?: { mode?: ParticleMode } }
      ).particle ??= {};
      (
        engineCfg.backendOverrides as { particle?: { mode?: ParticleMode } }
      ).particle!.mode = mode;
    }

    // Base diameter preference chain — avoid `number | false` by not using `&&`
    const baseSizePx =
      (isFiniteNumber(opts.baseSizePx) ? opts.baseSizePx : undefined) ??
      (isFiniteNumber(extraBase) ? extraBase : undefined) ??
      (isFiniteNumber(sizePx) ? sizePx : undefined) ??
      12;

    const pr = pickPixelRatio(opts as { pixelRatio?: number; dpr?: number });

    const renderOpts: RenderOptions = {
      engine: engineCfg,
      baseSizePx,
      width,
      height,
      seed: isFiniteNumber(opts.seed) ? opts.seed : 0,
      path: toEnginePath(opts.path),
      ...(typeof opts.color === "string" ? { color: opts.color } : {}),
      ...(isFiniteNumber(pr) ? { pixelRatio: pr } : {}),
      // Forward input if your RenderStrokeOptions includes it:
      // ...( "input" in opts && (opts as any).input ? { input: (opts as any).input } : {}),
    };

    // Resolve 2D context and delegate to particle/index
    const ctx =
      (surface.getContext?.("2d", { alpha: true }) as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null) ?? null;
    if (!ctx) throw new Error("2D context not available.");

    drawParticle(ctx, renderOpts);
  },
};

export default particleAdapter;
