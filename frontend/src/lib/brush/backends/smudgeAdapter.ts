import type { BackendAdapter, RenderStrokeOptions } from "./types";
import type {
  RenderOptions,
  RenderPathPoint,
  RenderOverrides,
  EngineConfig,
  EngineStrokePath,
} from "@/lib/brush/engine";
import drawSmudge from "./smudge"; // resolves to ./smudge/index.ts

type IncomingPoint = {
  x: number;
  y: number;
  p?: number;
  pressure?: number;
  angle?: number;
  tilt?: number;
  t?: number;
};

type SmudgeExtras = Partial<RenderOverrides> & {
  baseSizePx?: number;
  sizePx?: number;
  spacing?: number; // forwards to engine.strokePath.spacing
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function readPressure(pt: Pick<IncomingPoint, "p" | "pressure">): number {
  return isFiniteNumber(pt.p)
    ? pt.p
    : isFiniteNumber(pt.pressure)
      ? pt.pressure
      : 0.7;
}
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

const smudgeAdapter: BackendAdapter = {
  id: "smudge",
  name: "smudge",

  async renderStroke(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    opts: RenderStrokeOptions
  ): Promise<void> {
    const width = Math.max(1, Math.floor(opts.width));
    const height = Math.max(1, Math.floor(opts.height));

    const ctx =
      (canvas.getContext &&
        (canvas.getContext("2d", { alpha: true }) as
          | CanvasRenderingContext2D
          | OffscreenCanvasRenderingContext2D
          | null)) ||
      null;
    if (!ctx) throw new Error("2D context not available.");

    const rawExtra: SmudgeExtras = (opts.extra ?? {}) as SmudgeExtras;
    const {
      baseSizePx: extraBase,
      sizePx,
      spacing,
      ...restOverrides
    } = rawExtra;

    const overrides: Partial<RenderOverrides> = pruneUndefined<RenderOverrides>(
      restOverrides as Partial<RenderOverrides>
    );

    const baseSizePx = isFiniteNumber(extraBase)
      ? extraBase
      : isFiniteNumber(sizePx)
        ? sizePx
        : isFiniteNumber(opts.baseSizePx)
          ? opts.baseSizePx
          : 12;

    const strokePath: EngineStrokePath = {};
    if (isFiniteNumber(spacing)) strokePath.spacing = spacing;

    const engineCfg: EngineConfig = { overrides };
    if (Object.keys(strokePath).length > 0) engineCfg.strokePath = strokePath;

    const renderOpts: RenderOptions = {
      engine: engineCfg,
      baseSizePx,
      width,
      height,
      seed: isFiniteNumber(opts.seed) ? opts.seed : 0,
      path: toEnginePath(opts.path),
      ...(typeof (opts as { color?: string }).color === "string"
        ? { color: (opts as { color: string }).color }
        : {}),
      ...(isFiniteNumber((opts as { dpr?: number }).dpr)
        ? { pixelRatio: (opts as { dpr: number }).dpr }
        : {}),
      ...(isFiniteNumber((opts as { pixelRatio?: number }).pixelRatio)
        ? { pixelRatio: (opts as { pixelRatio: number }).pixelRatio }
        : {}),
      ...(opts.input ? { input: opts.input } : {}),
    };

    drawSmudge(ctx, renderOpts);
  },
};

export default smudgeAdapter;
