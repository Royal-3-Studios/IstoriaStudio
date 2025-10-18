// FILE: src/lib/brush/backends/sprayAdapter.ts

import type {
  BackendAdapter,
  RenderStrokeOptions,
  CanvasSurface,
  AdapterExtra,
} from "@backends/types";

import type {
  RenderOptions,
  RenderOverrides,
  EngineConfig,
  RenderPathPoint,
} from "@/lib/brush/engine.types";

import { drawToCanvas as drawSprayToCanvas } from "./spray"; // resolves to ./spray/index.ts
import { withBaseCaps } from "@/lib/brush/backends/caps";
import type { SprayOptions } from "./spray/types";

/* ============================ Local helper types ============================ */

type IncomingPoint = {
  x: number;
  y: number;
  p?: number; // shorthand pressure
  pressure?: number; // verbose pressure
  angle?: number;
  tilt?: number;
  t?: number; // optional timestamp (ms)
};

type SprayExtrasWide = Partial<RenderOverrides> &
  AdapterExtra & {
    baseSizePx?: number; // allow passing base size via extra
    sizePx?: number; // legacy alias
    spray?: Partial<SprayOptions>; // preferred place for spray settings

    // Legacy fields (still honored if present at the root of extra)
    sigmaPx?: number;
    hardness?: number;
    flow?: number;
    hoverRateAlphaPerSec?: number;
    moveRateAlphaPerPx?: number;
    minStepMs?: number;
    noiseAmount?: number;
    noiseScalePx?: number;
    spriteResolution?: number;
  };

/* ================================= Helpers ================================= */

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function pressureOf(pt: Pick<IncomingPoint, "p" | "pressure">): number {
  if (isFiniteNumber(pt.p)) return pt.p;
  if (isFiniteNumber(pt.pressure)) return pt.pressure;
  return 0.7; // sensible default
}

/** Normalize external path → engine path (omit undefined optionals). */
function normalizePath(path: RenderStrokeOptions["path"]): RenderPathPoint[] {
  const src = (path ?? []) as IncomingPoint[];
  return src.map((pt) => {
    const p = pressureOf(pt);
    const out: RenderPathPoint = { x: pt.x, y: pt.y, p, pressure: p };
    if (isFiniteNumber(pt.angle)) out.angle = pt.angle;
    if (isFiniteNumber(pt.tilt)) out.tilt = pt.tilt;
    if (isFiniteNumber(pt.t)) out.t = pt.t;
    return out;
  });
}

/** Remove only keys with `undefined` values (keeps 0/false/null). */
function pruneUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k in obj) if (obj[k] !== undefined) out[k] = obj[k];
  return out as Partial<T>;
}

/** Safe numeric getter that never returns undefined. */
function numberOr(value: unknown, fallback: number): number {
  return isFiniteNumber(value) ? (value as number) : fallback;
}

/* ------------------------- Resolved (required) defaults -------------------- */

/** A local, fully-required variant of SprayOptions for guaranteed fallbacks. */
type ResolvedSprayOptions = Required<SprayOptions>;

/** Concrete defaults (every field is a number). */
const DEFAULT_SPRAY: ResolvedSprayOptions = {
  sigmaPx: 12,
  hardness: 10,
  flow: 100,
  hoverRateAlphaPerSec: 1.0,
  moveRateAlphaPerPx: 0.04,
  minStepMs: 8,
  noiseAmount: 0,
  noiseScalePx: 64,
  spriteResolution: 256,
};

/**
 * Merge extras (both new `extra.spray` and legacy root fields) into a
 * complete SprayOptions object with **definite numbers** for every property.
 * Works under exactOptionalPropertyTypes without leaking `undefined`.
 */
function buildSprayOptionsFromExtras(extras: SprayExtrasWide): SprayOptions {
  const incoming = extras.spray ?? {};

  return {
    sigmaPx: numberOr(
      incoming.sigmaPx ?? extras.sigmaPx,
      DEFAULT_SPRAY.sigmaPx
    ),
    hardness: numberOr(
      incoming.hardness ?? extras.hardness,
      DEFAULT_SPRAY.hardness
    ),
    flow: numberOr(incoming.flow ?? extras.flow, DEFAULT_SPRAY.flow),
    hoverRateAlphaPerSec: numberOr(
      incoming.hoverRateAlphaPerSec ?? extras.hoverRateAlphaPerSec,
      DEFAULT_SPRAY.hoverRateAlphaPerSec
    ),
    moveRateAlphaPerPx: numberOr(
      incoming.moveRateAlphaPerPx ?? extras.moveRateAlphaPerPx,
      DEFAULT_SPRAY.moveRateAlphaPerPx
    ),
    minStepMs: numberOr(
      incoming.minStepMs ?? extras.minStepMs,
      DEFAULT_SPRAY.minStepMs
    ),
    noiseAmount: numberOr(
      incoming.noiseAmount ?? extras.noiseAmount,
      DEFAULT_SPRAY.noiseAmount
    ),
    noiseScalePx: numberOr(
      incoming.noiseScalePx ?? extras.noiseScalePx,
      DEFAULT_SPRAY.noiseScalePx
    ),
    spriteResolution: numberOr(
      incoming.spriteResolution ?? extras.spriteResolution,
      DEFAULT_SPRAY.spriteResolution
    ),
  };
}

/* ================================ Adapter ================================= */

const sprayCaps = withBaseCaps({
  flow: true, // honors flow
  tilt: true, // tilt can be routed via overrides if your core uses it
  worker: true, // OffscreenCanvas-safe
});

const sprayAdapter: BackendAdapter = {
  id: "spray",
  name: "spray",
  caps: sprayCaps,

  async renderStroke(
    surface: CanvasSurface,
    opts: RenderStrokeOptions
  ): Promise<void> {
    const width = Math.max(1, Math.floor(opts.width));
    const height = Math.max(1, Math.floor(opts.height));

    // Standardized extras (supports new extra.* and legacy-on-root)
    const extras = (opts.extra ?? {}) as SprayExtrasWide;

    // RenderOverrides (composite/opacity/etc) live here — NOT spray physics.
    const overrideBag = (extras.overrides ?? {}) as Partial<RenderOverrides>;
    const { spray: _sprayIgnoredInOverrides, ...legacyOverrideRoots } =
      extras as any;

    const renderOverrides: Partial<RenderOverrides> =
      pruneUndefined<RenderOverrides>({
        ...(legacyOverrideRoots as Partial<RenderOverrides>),
        ...overrideBag,
      });

    // Base size: firmly resolve to a number
    const baseSizePx: number = isFiniteNumber(opts.baseSizePx)
      ? opts.baseSizePx
      : isFiniteNumber(extras.baseSizePx)
        ? extras.baseSizePx!
        : isFiniteNumber(extras.sizePx)
          ? extras.sizePx!
          : 24;

    // Merge SprayOptions (all numeric, exactOptionalPropertyTypes-safe)
    const spray: SprayOptions = buildSprayOptionsFromExtras(extras);

    // Engine config (no strokePath here; spray core reads RenderOptions.spray + .path)
    const engineConfig: EngineConfig = { overrides: renderOverrides };

    const renderOpts: RenderOptions & { spray: SprayOptions } = {
      engine: engineConfig,
      baseSizePx,
      width,
      height,
      seed: isFiniteNumber(opts.seed) ? opts.seed : 0,
      path: normalizePath(opts.path),
      spray,
      ...(typeof opts.color === "string" ? { color: opts.color } : {}),
      ...(isFiniteNumber(opts.pixelRatio)
        ? { pixelRatio: opts.pixelRatio }
        : {}),
      // Forward input so unified stabilization / prediction / spacing modulation applies
      ...(opts.input ? { input: opts.input } : {}),
    };

    await Promise.resolve(drawSprayToCanvas(surface, renderOpts));
  },
};

export default sprayAdapter;
