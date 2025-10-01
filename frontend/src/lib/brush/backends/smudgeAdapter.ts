// FILE: src/lib/brush/backends/smudgeAdapter.ts
import type { BackendAdapter, RenderStrokeOptions } from "./types";
import type {
  RenderOptions,
  RenderPathPoint,
  RenderOverrides,
  EngineConfig,
  EngineStrokePath,
} from "@/lib/brush/engine";
import { drawSmudgeToCanvas } from "./smudge";

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

type SmudgeExtras = Partial<RenderOverrides> & {
  baseSizePx?: number; // allow passing base size via extra
  sizePx?: number; // legacy alias if you had it
  smudgeSpacing?: number; // map to strokePath.spacing when provided
};

/* =============================== Helpers =================================== */

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function readPressure(pt: Pick<IncomingPoint, "p" | "pressure">): number {
  if (isFiniteNumber(pt.p)) return pt.p;
  if (isFiniteNumber(pt.pressure)) return pt.pressure;
  return 0.7; // friendly default for mice/tests
}

// Remove keys whose value is strictly undefined (helps exactOptionalPropertyTypes)
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

/* ================================ Adapter ================================== */

const smudgeAdapter: BackendAdapter = {
  id: "smudge",
  name: "smudge",

  async renderStroke(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    opts: RenderStrokeOptions
  ): Promise<void> {
    const width = Math.max(1, Math.floor(opts.width));
    const height = Math.max(1, Math.floor(opts.height));

    // Narrow `extra` to a typed surface (no any)
    const rawExtra: SmudgeExtras = (opts.extra ?? {}) as SmudgeExtras;

    // Strip special keys; keep the rest as overrides and prune undefineds
    const {
      baseSizePx: extraBase,
      sizePx,
      smudgeSpacing,
      ...restOverrides
    } = rawExtra;

    const overrides: Partial<RenderOverrides> = pruneUndefined<RenderOverrides>(
      restOverrides as Partial<RenderOverrides>
    );

    // Base size (support both keys), default 12
    const baseSizePx = isFiniteNumber(extraBase)
      ? extraBase
      : isFiniteNumber(sizePx)
        ? sizePx
        : 12;

    // Build strokePath conditionally (map smudgeSpacing -> spacing)
    const strokePath: EngineStrokePath = {};
    if (isFiniteNumber(smudgeSpacing)) strokePath.spacing = smudgeSpacing;

    // Build engine config, omitting empty optionals
    const engineCfg: EngineConfig = { overrides };
    if (Object.keys(strokePath).length > 0) engineCfg.strokePath = strokePath;

    const renderOpts: RenderOptions = {
      engine: engineCfg,
      baseSizePx,
      width,
      height,
      seed: isFiniteNumber(opts.seed) ? opts.seed : 0,
      path: toEnginePath(opts.path),
      // Forward optional fields only if your RenderStrokeOptions includes them:
      // color: (opts as { color?: string }).color,
      // pixelRatio: (opts as { pixelRatio?: number }).pixelRatio,
      // input: (opts as { input?: BrushInputConfig }).input,
    };

    await Promise.resolve(drawSmudgeToCanvas(canvas, renderOpts));
  },
};

export default smudgeAdapter;
