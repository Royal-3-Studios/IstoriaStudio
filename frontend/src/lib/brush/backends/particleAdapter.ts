// FILE: src/lib/brush/backends/particleAdapter.ts
import type {
  BackendAdapter,
  RenderStrokeOptions,
  CanvasSurface,
} from "./types";
import type {
  RenderOptions,
  RenderPathPoint,
  RenderOverrides,
  EngineStrokePath,
} from "@/lib/brush/engine";
import { drawParticleToCanvas } from "./particle";

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

type ParticleExtras = Partial<RenderOverrides> & {
  /** Convenience knobs accepted by this adapter. */
  baseSizePx?: number; // prefer this; falls back to sizePx
  sizePx?: number; // legacy alias
  streamline?: number; // route to EngineStrokePath.streamline

  /** Particle-specific tunables (if your backend reads them from overrides). */
  particleEmissionBase?: number;
  particleSizeK?: number;
  particleSpeedK?: number;
  particleDamping?: number;
  particleLifeMin?: number;
  particleLifeMax?: number;
  particleConeDeg?: number;
  particleBlurPx?: number;
  particleComposite?: CanvasRenderingContext2D["globalCompositeOperation"];
  particleFadePow?: number;
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

const particleAdapter: BackendAdapter = {
  id: "particle",
  name: "particle",

  async renderStroke(
    surface: CanvasSurface,
    opts: RenderStrokeOptions
  ): Promise<void> {
    const width = Math.max(1, Math.floor(opts.width));
    const height = Math.max(1, Math.floor(opts.height));

    // Narrow extras to a typed surface
    const rawExtra: ParticleExtras = (opts.extra ?? {}) as ParticleExtras;

    // Peel off convenience keys; keep the rest as typed overrides and prune undefineds
    const {
      baseSizePx: extraBase,
      sizePx,
      streamline,
      ...restOverrides
    } = rawExtra;

    const cleanedOverrides = pruneUndefined<ParticleExtras>(
      restOverrides as Partial<ParticleExtras>
    );

    // Defaults (tweak as desired for smoke tests)
    const defaultBaseSize = 10;
    const defaultColor = "#222222";

    // Base diameter (with convenience fallbacks)
    const baseSizePx = isFiniteNumber(opts.baseSizePx)
      ? opts.baseSizePx
      : isFiniteNumber(extraBase)
        ? extraBase
        : isFiniteNumber(sizePx)
          ? sizePx
          : defaultBaseSize;

    // Provide sensible spacing/etc defaults if caller didn’t supply them
    const spacing = isFiniteNumber(cleanedOverrides.spacing)
      ? cleanedOverrides.spacing!
      : 6;
    const jitter = isFiniteNumber(cleanedOverrides.jitter)
      ? cleanedOverrides.jitter!
      : 0;
    const scatter = isFiniteNumber(cleanedOverrides.scatter)
      ? cleanedOverrides.scatter!
      : 0;
    const count = isFiniteNumber(cleanedOverrides.count)
      ? cleanedOverrides.count!
      : 1;

    // Build strokePath conditionally (avoid undefined writes)
    const strokePath: EngineStrokePath = { spacing, jitter, scatter, count };
    if (isFiniteNumber(streamline)) strokePath.streamline = streamline;

    // Seed particle defaults, then let cleaned overrides replace them
    const fullOverrides: ParticleExtras = {
      // Particle defaults
      particleEmissionBase: 3,
      particleSizeK: 0.22,
      particleSpeedK: 0.85,
      particleDamping: 0.86,
      particleLifeMin: 4,
      particleLifeMax: 5,
      particleConeDeg: 18,
      particleBlurPx: 0,
      particleComposite: "multiply",
      particleFadePow: 1.0,

      // Generic brush controls (with sensible defaults)
      opacity: isFiniteNumber(cleanedOverrides.opacity)
        ? cleanedOverrides.opacity!
        : 100,
      flow: isFiniteNumber(cleanedOverrides.flow)
        ? cleanedOverrides.flow!
        : 100,

      // Path distribution
      spacing,
      jitter,
      scatter,
      count,

      // Allow caller to override any of the above
      ...cleanedOverrides,
    };

    // Narrow to RenderOverrides (extra particle* keys can remain at runtime if your backend reads them)
    const overrides: Partial<RenderOverrides> =
      fullOverrides as Partial<RenderOverrides>;

    // Precompute pixel ratio candidate
    const prCandidate = pickPixelRatio(opts);

    // Final RenderOptions (single expression; no undefined writes)
    const renderOpts: RenderOptions = {
      engine: {
        overrides,
        strokePath,
      },
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

    await Promise.resolve(drawParticleToCanvas(surface, renderOpts));
  },
};

export default particleAdapter;
