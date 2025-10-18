// FILE: src/lib/brush/backends/stamping/stampingAdapter.ts

import type {
  RenderOptions,
  RenderPathPoint,
  RenderOverrides,
  EngineConfig,
  EngineStrokePath,
} from "@/lib/brush/engine.types";
import { get2D } from "@backends/utils/canvas";

import drawStamping from "./stamping";

import type {
  RenderStrokeOptions,
  BackendAdapter,
  CanvasSurface,
  AdapterExtra,
} from "@backends/types";

import {
  CAPS_STAMPING_TILT,
  withBaseCaps,
  type BackendCaps,
} from "@/lib/brush/backends/caps";

/* ============================ Local helper types ============================ */

type IncomingPoint = {
  x: number;
  y: number;
  p?: number;
  pressure?: number;
  angle?: number;
  tilt?: number;
  t?: number;
};

type StampingExtrasWide = Partial<RenderOverrides> &
  AdapterExtra & {
    baseSizePx?: number; // preferred
    sizePx?: number; // legacy alias
    streamline?: number;
    strokePath?: EngineStrokePath;
    mode?:
      | "graphite"
      | "ink"
      | "marker"
      | "calligraphy"
      | "scatter"
      | "stamp"
      | "ornament";
  };

type EngineStampingMode = "graphite" | "ink";

/* ================================= Helpers ================================= */

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function readPressure(pt: Pick<IncomingPoint, "p" | "pressure">): number {
  if (isFiniteNumber(pt.p)) return pt.p;
  if (isFiniteNumber(pt.pressure)) return pt.pressure;
  return 1;
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

function toEngineStampingMode(
  m: StampingExtrasWide["mode"]
): EngineStampingMode | undefined {
  return m === "graphite" || m === "ink" ? m : undefined;
}

/* ================================ Caps ================================= */

export const caps: Readonly<BackendCaps> = CAPS_STAMPING_TILT;
// Set worker:true only if OffscreenCanvas path is guaranteed
export const stampingCaps = withBaseCaps({ ...caps, worker: true });

/* =============================== Adapter ================================== */

const stampingAdapter: BackendAdapter = {
  id: "stamping",
  name: "stamping",
  caps: stampingCaps,

  async renderStroke(
    surface: CanvasSurface,
    opts: RenderStrokeOptions
  ): Promise<void> {
    const width = Math.max(1, Math.floor(opts.width));
    const height = Math.max(1, Math.floor(opts.height));

    const extra = (opts.extra ?? {}) as StampingExtrasWide;

    // Split extras
    const {
      baseSizePx: extraBase,
      sizePx,
      streamline,
      mode,
      strokePath: extraStrokePath,
      // anything else at root that happens to match RenderOverrides keys
      ...legacyOverridesAtRoot
    } = extra;

    // Merge overrides: (legacy root) → (extra.overrides)
    const extraOverrides = (extra.overrides ?? {}) as Partial<RenderOverrides>;
    const overrides: Partial<RenderOverrides> = {
      ...legacyOverridesAtRoot,
      ...extraOverrides,
    };

    // Base size resolution
    const baseSizePx = isFiniteNumber(opts.baseSizePx)
      ? opts.baseSizePx
      : isFiniteNumber(extraBase)
        ? extraBase
        : isFiniteNumber(sizePx)
          ? sizePx
          : 12;

    // Stroke-path controls (placement/jitter/streamline)
    const strokePath: EngineStrokePath = { ...(extraStrokePath ?? {}) };
    if (isFiniteNumber(overrides.spacing))
      strokePath.spacing = overrides.spacing;
    if (isFiniteNumber(overrides.jitter)) strokePath.jitter = overrides.jitter;
    if (isFiniteNumber(overrides.scatter))
      strokePath.scatter = overrides.scatter;
    if (isFiniteNumber(overrides.count)) strokePath.count = overrides.count;
    if (isFiniteNumber(streamline)) strokePath.streamline = streamline;

    // Engine config (keep strokePath separate from overrides)
    const engineCfg: EngineConfig & {
      backendOverrides?: { stamping?: { mode?: EngineStampingMode } };
    } = { overrides };

    if (Object.keys(strokePath).length > 0) {
      engineCfg.strokePath = strokePath;
    }

    const narrowed = toEngineStampingMode(mode);
    if (narrowed) {
      engineCfg.backendOverrides ??= {};
      engineCfg.backendOverrides.stamping ??= {};
      engineCfg.backendOverrides.stamping.mode = narrowed;
    }

    // Final RenderOptions forwarded to stamping backend
    const renderOpts: RenderOptions = {
      engine: engineCfg,
      baseSizePx,
      width,
      height,
      seed: isFiniteNumber(opts.seed) ? opts.seed : 0,
      path: toEnginePath(opts.path),
      ...(typeof opts.color === "string" ? { color: opts.color } : {}),
      ...(isFiniteNumber(opts.pixelRatio)
        ? { pixelRatio: opts.pixelRatio }
        : {}),
      // Forward input (pressure pipeline / prediction / spacing modulation)
      ...(opts.input ? { input: opts.input } : {}),
    };

    const ctx = get2D(surface);
    drawStamping(ctx, renderOpts);
  },
};

export default stampingAdapter;
