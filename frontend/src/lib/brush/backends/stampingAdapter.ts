// FILE: src/lib/brush/backends/stampingAdapter.ts
import type { BackendAdapter, RenderStrokeOptions } from "./types";
import type {
  RenderOptions,
  RenderPathPoint,
  RenderOverrides,
  EngineConfig,
  EngineStrokePath,
} from "@/lib/brush/engine";
import { drawStampingToCanvas } from "./stamping";

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

type StampingExtras = Partial<RenderOverrides> & {
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
  return 1; // default to firm press
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

const stampingAdapter: BackendAdapter = {
  id: "stamping",
  name: "stamping",

  async renderStroke(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    opts: RenderStrokeOptions
  ): Promise<void> {
    const width = Math.max(1, Math.floor(opts.width));
    const height = Math.max(1, Math.floor(opts.height));

    // Narrow `extra` to a typed surface
    const rawExtra: StampingExtras = (opts.extra ?? {}) as StampingExtras;

    // Peel off base size keys; keep the rest as typed overrides
    const {
      baseSizePx: extraBase,
      sizePx,
      streamline,
      ...restOverrides
    } = rawExtra;

    const overrides: Partial<RenderOverrides> = { ...restOverrides };

    // Choose a base size
    const baseSizePx = isFiniteNumber(extraBase)
      ? extraBase
      : isFiniteNumber(sizePx)
        ? sizePx
        : 12;

    // Build strokePath by conditionally assigning keys (avoid undefined)
    const strokePath: EngineStrokePath = {};
    if (isFiniteNumber(overrides.spacing))
      strokePath.spacing = overrides.spacing!;
    if (isFiniteNumber(overrides.jitter)) strokePath.jitter = overrides.jitter!;
    if (isFiniteNumber(overrides.scatter))
      strokePath.scatter = overrides.scatter!;
    if (isFiniteNumber(overrides.count)) strokePath.count = overrides.count!;
    if (isFiniteNumber(streamline)) strokePath.streamline = streamline;

    // Build engine config (omit strokePath if empty to satisfy exactOptionalPropertyTypes)
    const engineCfg: EngineConfig = { overrides };
    if (Object.keys(strokePath).length > 0) {
      engineCfg.strokePath = strokePath;
    }

    const renderOpts: RenderOptions = {
      engine: engineCfg,
      baseSizePx,
      width,
      height,
      seed: isFiniteNumber(opts.seed) ? opts.seed : 0,
      path: toEnginePath(opts.path),
      // Optionally forward color/pixelRatio if your backends expect them:
      // color: opts.color,
      // pixelRatio: opts.dpr,
    };

    await Promise.resolve(drawStampingToCanvas(canvas, renderOpts));
  },
};

export default stampingAdapter;
