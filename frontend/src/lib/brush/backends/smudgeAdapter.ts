// FILE: src/lib/brush/backends/smudgeAdapter.ts

import type {
  BackendAdapter,
  RenderStrokeOptions,
  CanvasSurface,
  AdapterExtra,
} from "@backends/types";

import type {
  RenderOptions,
  RenderPathPoint,
  RenderOverrides,
  EngineConfig,
} from "@/lib/brush/engine.types";

import { drawToCanvas as drawSmudgeToCanvas } from "./smudge"; // resolves to ./smudge/index.ts
import { withBaseCaps } from "@/lib/brush/backends/caps";
import type { SmudgeOptions } from "./smudge/types";

/* ============================ Local helper types ============================ */

type IncomingPoint = {
  x: number;
  y: number;
  p?: number;
  pressure?: number;
  angle?: number;
  tilt?: number;
  t?: number; // timestamp (ms) optional
};

type SmudgeExtrasWide = Partial<RenderOverrides> &
  AdapterExtra & {
    // Global sizing (adapter-level)
    baseSizePx?: number;
    sizePx?: number; // legacy alias

    // Preferred: nested smudge options
    smudge?: Partial<SmudgeOptions>;

    // Legacy root fields (still honored)
    strengthPct?: number; // 0..100
    scatterPx?: number; // px
    minStepMs?: number; // ms
    dirtyAmountPct?: number; // 0..100
    dirtyEvapPct?: number; // 0..100
    softenPx?: number; // px
  };

/* ================================= Helpers ================================= */

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function pressureOf(pt: Pick<IncomingPoint, "p" | "pressure">): number {
  if (isFiniteNumber(pt.p)) return pt.p;
  if (isFiniteNumber(pt.pressure)) return pt.pressure;
  return 0.7; // pleasant default for blending dynamics
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

/** Keep only defined keys (preserve 0/false/null). */
function pruneUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k in obj) if (obj[k] !== undefined) out[k] = obj[k];
  return out as Partial<T>;
}

/** Safe numeric getter that never returns undefined. */
function numOr(value: unknown, fallback: number): number {
  return isFiniteNumber(value) ? (value as number) : fallback;
}

/* --------------------------- Resolved defaults ----------------------------- */

/** Fully required defaults for smudge (concrete numbers). */
const DEFAULT_SMUDGE: Required<SmudgeOptions> = {
  baseSizePx: 18,
  strengthPct: 70, // 0..100
  scatterPx: 0, // px
  minStepMs: 8, // ms
  dirtyAmountPct: 60, // keep % semantics
  dirtyEvapPct: 15, // fade % per step
  softenPx: 0, // px
};

/** Build a complete SmudgeOptions with definite numbers from extras. */
function buildSmudgeFromExtras(
  extras: SmudgeExtrasWide,
  resolvedBaseSize: number
): SmudgeOptions {
  const s = extras.smudge ?? {};
  return {
    baseSizePx: numOr(
      s.baseSizePx ?? resolvedBaseSize,
      DEFAULT_SMUDGE.baseSizePx
    ),
    strengthPct: numOr(
      s.strengthPct ?? extras.strengthPct,
      DEFAULT_SMUDGE.strengthPct
    ),
    scatterPx: numOr(s.scatterPx ?? extras.scatterPx, DEFAULT_SMUDGE.scatterPx),
    minStepMs: numOr(s.minStepMs ?? extras.minStepMs, DEFAULT_SMUDGE.minStepMs),
    dirtyAmountPct: numOr(
      s.dirtyAmountPct ?? extras.dirtyAmountPct,
      DEFAULT_SMUDGE.dirtyAmountPct
    ),
    dirtyEvapPct: numOr(
      s.dirtyEvapPct ?? extras.dirtyEvapPct,
      DEFAULT_SMUDGE.dirtyEvapPct
    ),
    softenPx: numOr(s.softenPx ?? extras.softenPx, DEFAULT_SMUDGE.softenPx),
  };
}

/* ================================ Adapter ================================= */

const smudgeCaps = withBaseCaps({
  flow: true, // composite/opacity honored in engine
  tilt: true, // tilt can be routed via overrides
  smudge: true,
  worker: true, // OffscreenCanvas-safe
});

const smudgeAdapter: BackendAdapter = {
  id: "smudge",
  name: "smudge",
  caps: smudgeCaps,

  async renderStroke(
    surface: CanvasSurface,
    opts: RenderStrokeOptions
  ): Promise<void> {
    const width = Math.max(1, Math.floor(opts.width));
    const height = Math.max(1, Math.floor(opts.height));

    // Standardized extras (supports new extra.* and legacy root fields)
    const extras = (opts.extra ?? {}) as SmudgeExtrasWide;

    // RenderOverrides: compositing/opacity/etc — NOT spacing/physics
    const extraOverrides = (extras.overrides ?? {}) as Partial<RenderOverrides>;
    const { smudge: _ignoreSmudgeInsideOverrides, ...legacyOverrideRoots } =
      extras as any;

    const renderOverrides: Partial<RenderOverrides> =
      pruneUndefined<RenderOverrides>({
        ...(legacyOverrideRoots as Partial<RenderOverrides>),
        ...extraOverrides,
      });

    // Resolve top-level base size (strict number)
    const baseSizePxTop: number = isFiniteNumber(opts.baseSizePx)
      ? opts.baseSizePx
      : isFiniteNumber(extras.baseSizePx)
        ? extras.baseSizePx!
        : isFiniteNumber(extras.sizePx)
          ? extras.sizePx!
          : DEFAULT_SMUDGE.baseSizePx;

    // Merge SmudgeOptions (all numeric, exactOptionalPropertyTypes-safe)
    const smudge: SmudgeOptions = buildSmudgeFromExtras(extras, baseSizePxTop);

    // Engine config (no strokePath; core reads RenderOptions.smudge + .path)
    const engineCfg: EngineConfig = { overrides: renderOverrides };

    const renderOpts: RenderOptions & { smudge: SmudgeOptions } = {
      engine: engineCfg,
      baseSizePx: baseSizePxTop, // still set global baseSizePx for parity
      width,
      height,
      seed: isFiniteNumber(opts.seed) ? opts.seed : 0,
      path: normalizePath(opts.path),
      smudge,
      ...(typeof opts.color === "string" ? { color: opts.color } : {}),
      ...(isFiniteNumber(opts.pixelRatio)
        ? { pixelRatio: opts.pixelRatio }
        : {}),
      // Forward input so unified stabilization/prediction applies
      ...(opts.input ? { input: opts.input } : {}),
    };

    await Promise.resolve(drawSmudgeToCanvas(surface, renderOpts));
  },
};

export default smudgeAdapter;
