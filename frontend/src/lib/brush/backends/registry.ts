// FILE: src/lib/brush/backends/registry.ts
import type { BackendAdapter as PublicAdapter } from "./adapter.types";
import type { CanvasLike } from "./utils/canvas";
import type { RenderOptions, EngineConfig } from "@/lib/brush/engine.types";
import type { RenderStrokeOptions, RenderStrokePoint } from "./types"; // your existing adapter types

/* -------------------------- concrete legacy adapters -------------------------- */
/** Each of these modules should export a default LegacyStrokeAdapter-like object.
 *  If they already export `caps`, we’ll surface them; otherwise we’ll inject a safe default.
 */
import stampingAdapter from "./stampingAdapter";
import ribbonAdapter from "./ribbonAdapter";
import sprayAdapter from "./sprayAdapter";
import wetAdapter from "./wetAdapter";
import patternAdapter from "./patternAdapter";
import smudgeAdapter from "./smudgeAdapter";
import particleAdapter from "./particleAdapter";
import impastoAdapter from "./impastoAdapter";
import type { BackendCaps } from "./caps";

/* ---------------------------------- types ---------------------------------- */

type LegacyStrokeAdapter = {
  id: string;
  /** Truthful capability flags used by the UI. */
  caps?: Readonly<BackendCaps>;
  renderStroke: (
    surface: CanvasLike,
    opts: RenderStrokeOptions
  ) => Promise<void> | void;
};

/* ------------------------------ small helpers ------------------------------ */

function safeDevicePixelRatio(): number {
  // Avoid `any` and work in SSR too
  if (typeof window === "undefined") return 1;
  const dpr = (window as unknown as { devicePixelRatio?: number })
    .devicePixelRatio;
  return typeof dpr === "number" && Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
}

// Convert the engine RenderOptions (normalized) → legacy RenderStrokeOptions expected by existing adapters.
function toRenderStrokeOptions(opt: RenderOptions): RenderStrokeOptions {
  const engine: EngineConfig = opt.engine ?? {};

  const pixelRatio =
    typeof opt.pixelRatio === "number" &&
    Number.isFinite(opt.pixelRatio) &&
    opt.pixelRatio > 0
      ? opt.pixelRatio
      : safeDevicePixelRatio();

  const path = (opt.path ?? []).map<RenderStrokePoint>((p) => {
    const pShort =
      typeof p.p === "number"
        ? p.p
        : typeof p.pressure === "number"
          ? p.pressure
          : undefined;

    const pLong =
      typeof p.pressure === "number"
        ? p.pressure
        : typeof p.p === "number"
          ? p.p
          : undefined;

    return {
      x: p.x,
      y: p.y,
      ...(pShort !== undefined ? { p: pShort } : {}),
      ...(pLong !== undefined ? { pressure: pLong } : {}),
      ...(typeof p.angle === "number" ? { angle: p.angle } : {}),
      ...(typeof p.tilt === "number" ? { tilt: p.tilt } : {}),
      ...(typeof p.t === "number" ? { t: p.t } : {}),
    };
  });

  const extra: Record<string, unknown> = {};
  if (engine.overrides) extra.overrides = engine.overrides;
  if (engine.strokePath) extra.strokePath = engine.strokePath;
  if (engine.shape) extra.shape = engine.shape;
  if (engine.rendering) extra.rendering = engine.rendering;
  if (engine.grain) extra.grain = engine.grain;

  const out: RenderStrokeOptions = {
    width: Math.max(1, Math.floor(opt.width)),
    height: Math.max(1, Math.floor(opt.height)),
    seed: typeof opt.seed === "number" ? opt.seed : 0,
    pixelRatio,
    path,
    ...(typeof opt.color === "string" ? { color: opt.color } : {}),
    ...(typeof opt.baseSizePx === "number"
      ? { baseSizePx: opt.baseSizePx }
      : {}),
    ...(opt.input ? { input: opt.input } : {}),
    ...(Object.keys(extra).length ? { extra } : {}),
  };

  return out;
}

/** Ensure we always expose a truthful caps object.
 *  - pressure is fundamental across all current backends → default true
 *  - other flags default false unless the adapter sets them true
 */
function normalizeCaps(caps?: Readonly<BackendCaps>): Readonly<BackendCaps> {
  return Object.freeze({
    // required truths in your model
    pressure: true,
    spacing: true,
    // safe defaults for optionals
    flow: false,
    tilt: false,
    angle: false,
    rotation: false,
    grainMotion: false,
    wet: false,
    smudge: false,
    heightfield: false,
    lighting: false,
    gpu: false,
    worker: false,
    ...(caps ?? {}),
  });
}

function wrapLegacy(a: LegacyStrokeAdapter): PublicAdapter {
  const normalizedCaps = normalizeCaps(a.caps);
  return {
    id: a.id,
    caps: normalizedCaps,
    async drawToCanvas(canvas, normalized) {
      return a.renderStroke(canvas, toRenderStrokeOptions(normalized));
    },
  };
}

/* -------------------------------- registry -------------------------------- */

const entries = [
  stampingAdapter,
  ribbonAdapter,
  sprayAdapter,
  wetAdapter,
  patternAdapter,
  smudgeAdapter,
  particleAdapter,
  impastoAdapter,
] as const;

const pairs = entries.map((a) => {
  const legacy = a as unknown as LegacyStrokeAdapter;
  return [legacy.id.toLowerCase(), wrapLegacy(legacy)] as const;
});

export const ADAPTERS: ReadonlyMap<string, PublicAdapter> = new Map<
  string,
  PublicAdapter
>(pairs);

export function getAdapterForBackend(name?: string): PublicAdapter {
  const key = (name ?? "stamping").toLowerCase();
  const a = ADAPTERS.get(key);
  if (!a) {
    const known = Array.from(ADAPTERS.keys()).join(", ");
    throw new Error(`Unknown backend "${name}". Known: ${known}`);
  }
  return a;
}

export function getDefaultAdapter(): PublicAdapter {
  return getAdapterForBackend("stamping");
}

// Optional: allow runtime registration (tests/experiments)
export function registerAdapter(adapter: PublicAdapter): void {
  (ADAPTERS as Map<string, PublicAdapter>).set(
    adapter.id.toLowerCase(),
    adapter
  );
}

// Re-export public type
export type { PublicAdapter as BackendAdapter };
