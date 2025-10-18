// FILE: src/lib/brush/backends/particleAdapter.ts

import { drawToCanvas as drawParticleToCanvas } from "./particle"; // ./particle/index.ts

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

import { withBaseCaps } from "@/lib/brush/backends/caps";
import type {
  ParticleOptions,
  ParticleDecal,
  ParticleInkMode,
} from "./particle/types";

/* ============================ Local helper types ============================ */

type IncomingPoint = {
  x: number;
  y: number;
  p?: number; // shorthand pressure
  pressure?: number; // verbose pressure
  angle?: number;
  tilt?: number;
  t?: number; // timestamp (ms)
};

type ParticleExtrasWide = Partial<RenderOverrides> &
  AdapterExtra & {
    baseSizePx?: number; // adapter-level base size (optional)
    particle?: Partial<ParticleOptions>; // preferred way to pass particle opts

    // Legacy flat fields (still honored)
    emitRatePerSec?: number;
    lifeMs?: number;
    sizeMinPx?: number;
    sizeMaxPx?: number;
    speedMin?: number;
    speedMax?: number;
    dragPerSec?: number;
    gravity?: number;
    angleSpreadRad?: number;
    splatterProb?: number;
    dripGravity?: number;
    dripStretch?: number;
    noiseAmount?: number;
    noiseScalePx?: number;
    antiHaloPx?: number;
    antiHaloAlpha?: number;
    inkMode?: ParticleInkMode;
    decal?: ParticleDecal;
  };

/* ================================= Helpers ================================= */

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function pressureOf(pt: Pick<IncomingPoint, "p" | "pressure">): number {
  if (isNum(pt.p)) return pt.p;
  if (isNum(pt.pressure)) return pt.pressure;
  return 0.7;
}

/** Normalize external path → engine path (omit undefined optionals). */
function normalizePath(path: RenderStrokeOptions["path"]): RenderPathPoint[] {
  const src = (path ?? []) as IncomingPoint[];
  return src.map((pt) => {
    const p = pressureOf(pt);
    const out: RenderPathPoint = { x: pt.x, y: pt.y, p, pressure: p };
    if (isNum(pt.angle)) out.angle = pt.angle;
    if (isNum(pt.tilt)) out.tilt = pt.tilt;
    if (isNum(pt.t)) out.t = pt.t;
    return out;
  });
}

/** Keep only defined keys (preserve 0/false/null). */
function pruneU<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k in obj) if (obj[k] !== undefined) out[k] = obj[k];
  return out as Partial<T>;
}

/* --------------------------- Resolved defaults ----------------------------- */

/** Fully required defaults for safe merging at the adapter boundary. */
const DEFAULTS: Required<ParticleOptions> = {
  emitRatePerSec: 220,
  lifeMs: 950,
  sizeMinPx: 1.5,
  sizeMaxPx: 6,
  speedMin: 120,
  speedMax: 600,
  dragPerSec: 0.2,
  gravity: 900,
  angleSpreadRad: Math.PI * 0.2,
  splatterProb: 0.25,
  dripGravity: 600,
  dripStretch: 0.35,
  noiseAmount: 0.15,
  noiseScalePx: 48,
  decal: { kind: "round" },
  antiHaloPx: 0.6,
  antiHaloAlpha: 0.35,
  inkMode: "inner-grain",
};

function buildParticleOptions(extra: ParticleExtrasWide): ParticleOptions {
  const p = extra.particle ?? {};
  return {
    emitRatePerSec: isNum(p.emitRatePerSec ?? extra.emitRatePerSec)
      ? (p.emitRatePerSec ?? extra.emitRatePerSec)!
      : DEFAULTS.emitRatePerSec,
    lifeMs: isNum(p.lifeMs ?? extra.lifeMs)
      ? (p.lifeMs ?? extra.lifeMs)!
      : DEFAULTS.lifeMs,
    sizeMinPx: isNum(p.sizeMinPx ?? extra.sizeMinPx)
      ? (p.sizeMinPx ?? extra.sizeMinPx)!
      : DEFAULTS.sizeMinPx,
    sizeMaxPx: isNum(p.sizeMaxPx ?? extra.sizeMaxPx)
      ? (p.sizeMaxPx ?? extra.sizeMaxPx)!
      : DEFAULTS.sizeMaxPx,
    speedMin: isNum(p.speedMin ?? extra.speedMin)
      ? (p.speedMin ?? extra.speedMin)!
      : DEFAULTS.speedMin,
    speedMax: isNum(p.speedMax ?? extra.speedMax)
      ? (p.speedMax ?? extra.speedMax)!
      : DEFAULTS.speedMax,
    dragPerSec: isNum(p.dragPerSec ?? extra.dragPerSec)
      ? (p.dragPerSec ?? extra.dragPerSec)!
      : DEFAULTS.dragPerSec,
    gravity: isNum(p.gravity ?? extra.gravity)
      ? (p.gravity ?? extra.gravity)!
      : DEFAULTS.gravity,
    angleSpreadRad: isNum(p.angleSpreadRad ?? extra.angleSpreadRad)
      ? (p.angleSpreadRad ?? extra.angleSpreadRad)!
      : DEFAULTS.angleSpreadRad,
    splatterProb: isNum(p.splatterProb ?? extra.splatterProb)
      ? (p.splatterProb ?? extra.splatterProb)!
      : DEFAULTS.splatterProb,
    dripGravity: isNum(p.dripGravity ?? extra.dripGravity)
      ? (p.dripGravity ?? extra.dripGravity)!
      : DEFAULTS.dripGravity,
    dripStretch: isNum(p.dripStretch ?? extra.dripStretch)
      ? (p.dripStretch ?? extra.dripStretch)!
      : DEFAULTS.dripStretch,
    noiseAmount: isNum(p.noiseAmount ?? extra.noiseAmount)
      ? (p.noiseAmount ?? extra.noiseAmount)!
      : DEFAULTS.noiseAmount,
    noiseScalePx: isNum(p.noiseScalePx ?? extra.noiseScalePx)
      ? (p.noiseScalePx ?? extra.noiseScalePx)!
      : DEFAULTS.noiseScalePx,
    decal: p.decal ?? extra.decal ?? DEFAULTS.decal,
    antiHaloPx: isNum(p.antiHaloPx ?? extra.antiHaloPx)
      ? (p.antiHaloPx ?? extra.antiHaloPx)!
      : DEFAULTS.antiHaloPx,
    antiHaloAlpha: isNum(p.antiHaloAlpha ?? extra.antiHaloAlpha)
      ? (p.antiHaloAlpha ?? extra.antiHaloAlpha)!
      : DEFAULTS.antiHaloAlpha,
    inkMode:
      (p.inkMode ?? extra.inkMode) === "rim" ||
      (p.inkMode ?? extra.inkMode) === "inner-grain"
        ? (p.inkMode ?? extra.inkMode)!
        : DEFAULTS.inkMode,
  };
}

/* ================================= Adapter ================================= */

const particleCaps = withBaseCaps({
  flow: true,
  tilt: true,
  worker: true,
});

const particleAdapter: BackendAdapter = {
  id: "particle",
  name: "particle",
  caps: particleCaps,

  async renderStroke(
    surface: CanvasSurface,
    opts: RenderStrokeOptions
  ): Promise<void> {
    const width = Math.max(1, Math.floor(opts.width));
    const height = Math.max(1, Math.floor(opts.height));

    // Standardized extras (supports new extra.* and legacy flat fields)
    const extra = (opts.extra ?? {}) as ParticleExtrasWide;

    // RenderOverrides (composite/opacity/etc)
    const overrideBag = (extra.overrides ?? {}) as Partial<RenderOverrides>;
    const { particle: _ignoreInsideOverrides, ...legacyOverrideRoots } =
      extra as any;

    const overrides: Partial<RenderOverrides> = pruneU<RenderOverrides>({
      ...(legacyOverrideRoots as Partial<RenderOverrides>),
      ...overrideBag,
    });

    // Engine config (assign only when present)
    const engineCfg: EngineConfig = { overrides };

    // Base size (optional for particle; keep parity with other backends)
    const baseSizePx = isNum(opts.baseSizePx)
      ? opts.baseSizePx
      : isNum(extra.baseSizePx)
        ? extra.baseSizePx!
        : 16;

    const renderOpts: RenderOptions & { particle: ParticleOptions } = {
      engine: engineCfg,
      baseSizePx,
      width,
      height,
      seed: isNum(opts.seed) ? opts.seed : 0,
      path: normalizePath(opts.path),
      particle: buildParticleOptions(extra),
      ...(typeof opts.color === "string" ? { color: opts.color } : {}),
      ...(isNum(opts.pixelRatio) ? { pixelRatio: opts.pixelRatio } : {}),
      // Forward input so unified stabilization/prediction applies
      ...(opts.input ? { input: opts.input } : {}),
    };

    // particle/index.ts → drawToCanvas(surface, opt) (takes full RenderOptions)
    await Promise.resolve(drawParticleToCanvas(surface, renderOpts));
  },
};

export default particleAdapter;
