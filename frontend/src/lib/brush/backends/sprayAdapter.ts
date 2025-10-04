// FILE: src/lib/brush/backends/sprayAdapter.ts
import type { BackendAdapter, RenderStrokeOptions } from "./types";
import type {
  RenderOptions,
  RenderPathPoint,
  RenderOverrides,
  EngineConfig,
  EngineStrokePath,
} from "@/lib/brush/engine";
import drawSpray from "./spray/index"; // "./spray" resolves to ./spray/index.ts

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

type SprayExtras = Partial<RenderOverrides> & {
  baseSizePx?: number; // allow passing base size via extra
  sizePx?: number; // legacy alias
  streamline?: number; // route to EngineStrokePath.streamline
};

/* ================================= Helpers ================================= */

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function readPressure(pt: Pick<IncomingPoint, "p" | "pressure">): number {
  if (isFiniteNumber(pt.p)) return pt.p;
  if (isFiniteNumber(pt.pressure)) return pt.pressure;
  return 1; // default full press for spray feel
}

function pruneUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k in obj) {
    const v = obj[k];
    if (v !== undefined) out[k] = v;
  }
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

const sprayAdapter: BackendAdapter = {
  id: "spray",
  name: "spray",

  async renderStroke(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    opts: RenderStrokeOptions
  ): Promise<void> {
    const width = Math.max(1, Math.floor(opts.width));
    const height = Math.max(1, Math.floor(opts.height));

    // Get a 2D context — drawSpray expects a context, not the canvas
    const ctx =
      (canvas.getContext &&
        (canvas.getContext("2d", { alpha: true }) as
          | CanvasRenderingContext2D
          | OffscreenCanvasRenderingContext2D
          | null)) ||
      null;
    if (!ctx) throw new Error("2D context not available.");

    // Narrow `extra` to a typed surface (no any)
    const rawExtra: SprayExtras = (opts.extra ?? {}) as SprayExtras;

    // Peel off special keys; keep the rest as overrides and prune undefineds
    const {
      baseSizePx: extraBase,
      sizePx,
      streamline,
      ...restOverrides
    } = rawExtra;

    const overrides: Partial<RenderOverrides> = pruneUndefined<RenderOverrides>(
      restOverrides as Partial<RenderOverrides>
    );

    // Base size for spray dots
    const baseSizePx = isFiniteNumber(extraBase)
      ? extraBase
      : isFiniteNumber(sizePx)
        ? sizePx
        : isFiniteNumber(opts.baseSizePx)
          ? opts.baseSizePx
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

    // Build engine config, omitting empty optionals
    const engineCfg: EngineConfig = { overrides };
    if (Object.keys(strokePath).length > 0) engineCfg.strokePath = strokePath;

    // Build RenderOptions, forwarding color/pixelRatio/input if present
    const renderOpts: RenderOptions = {
      engine: engineCfg,
      baseSizePx,
      width,
      height,
      seed: isFiniteNumber(opts.seed) ? opts.seed : 0,
      path: toEnginePath(opts.path),
      ...(typeof opts.color === "string" ? { color: opts.color } : {}),
      ...(isFiniteNumber((opts as unknown as { dpr?: number }).dpr)
        ? { pixelRatio: (opts as unknown as { dpr: number }).dpr }
        : {}),
      ...(isFiniteNumber(
        (opts as unknown as { pixelRatio?: number }).pixelRatio
      )
        ? { pixelRatio: (opts as unknown as { pixelRatio: number }).pixelRatio }
        : {}),
      ...(opts.input ? { input: opts.input } : {}),
    };

    // Call the spray index (which switches between airbrush/nozzle/splatter/stipple)
    drawSpray(ctx, renderOpts);
  },
};

export default sprayAdapter;
