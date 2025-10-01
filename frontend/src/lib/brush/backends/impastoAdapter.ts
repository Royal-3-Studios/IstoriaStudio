// FILE: src/lib/brush/backends/impastoAdapter.ts
import { drawImpastoToCanvas } from "./impasto";
import type {
  BackendAdapter,
  CanvasSurface,
  RenderStrokeOptions,
} from "./types";
import type {
  RenderOptions,
  RenderPathPoint,
  RenderOverrides,
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
  t?: number; // timestamp (optional)
};

type ImpastoExtras = Partial<RenderOverrides> & {
  /** Convenience knobs accepted by this adapter. */
  baseSizePx?: number; // prefer this; falls back to sizePx
  sizePx?: number; // legacy alias

  /** StrokePath convenience (if you want to drive from extras). */
  spacing?: number; // route to EngineStrokePath.spacing
  streamline?: number; // route to EngineStrokePath.streamline
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

const impastoAdapter: BackendAdapter = {
  id: "impasto",
  name: "impasto",

  async renderStroke(
    surface: CanvasSurface,
    opts: RenderStrokeOptions
  ): Promise<void> {
    const width = Math.max(1, Math.floor(opts.width));
    const height = Math.max(1, Math.floor(opts.height));

    // Narrow extras to a typed surface
    const rawExtra: ImpastoExtras = (opts.extra ?? {}) as ImpastoExtras;

    // Peel off convenience keys; keep the rest as typed overrides and prune undefineds
    const {
      baseSizePx: extraBase,
      sizePx,
      spacing,
      streamline,
      ...restOverrides
    } = rawExtra;

    const overrides: Partial<RenderOverrides> = pruneUndefined<RenderOverrides>(
      restOverrides as Partial<RenderOverrides>
    );

    // Defaults (tweak as desired for smoke tests)
    const defaultBaseSize = 12;
    const defaultColor = "#46A0FF";
    const defaultSpacing = 6;

    // Base diameter (with convenience fallbacks)
    const baseSizePx = isFiniteNumber(opts.baseSizePx)
      ? opts.baseSizePx
      : isFiniteNumber(extraBase)
        ? extraBase
        : isFiniteNumber(sizePx)
          ? sizePx
          : defaultBaseSize;

    // Spacing (engine.strokePath)
    const spacingVal = isFiniteNumber(spacing) ? spacing : defaultSpacing;

    // Build strokePath (only fields impasto cares about); avoid undefined writes
    const strokePath: EngineStrokePath = { spacing: spacingVal };
    if (isFiniteNumber(streamline)) strokePath.streamline = streamline;

    // Precompute pixel ratio candidate
    const prCandidate = pickPixelRatio(opts);

    // Final RenderOptions (single expression; no undefined writes)
    const renderOpts: RenderOptions = {
      engine: { overrides, strokePath },
      baseSizePx,
      width,
      height,
      seed: isFiniteNumber(opts.seed) ? opts.seed : 0,
      path: toEnginePath(opts.path),
      color: typeof opts.color === "string" ? opts.color : defaultColor,
      ...(isFiniteNumber(prCandidate) ? { pixelRatio: prCandidate } : {}),
      // Forward input only if your RenderStrokeOptions includes it and it's defined:
      // ...("input" in opts && opts.input ? { input: opts.input } : {}),
    };

    await Promise.resolve(drawImpastoToCanvas(surface, renderOpts));
  },
};

export default impastoAdapter;
