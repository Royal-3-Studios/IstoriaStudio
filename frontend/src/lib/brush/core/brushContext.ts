// FILE: src/lib/brush/core/brushContext.ts
/**
 * BrushContext — per-stroke caches & utilities
 * Lifetime: ONE stroke.
 */

import { createLayer } from "@/lib/brush/backends/utils/canvas";

/* ============================== Types / Guards ============================== */

export type RNG = { nextFloat(): number };
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function isCtx2D(ctx: unknown): ctx is Ctx2D {
  if (!ctx || typeof ctx !== "object") return false;
  const c = ctx as Partial<CanvasRenderingContext2D>;
  return (
    typeof c.drawImage === "function" &&
    typeof c.clearRect === "function" &&
    typeof c.setTransform === "function"
  );
}

/* ============================== RNG (mulberry32) ============================ */

function mulberry32(seed: number): RNG {
  let a = seed >>> 0 || 1;
  return {
    nextFloat(): number {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/* ============================== Color utils ================================= */

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function colorHexToLinearRGB(hex?: string): [number, number, number] {
  if (!hex || typeof hex !== "string" || hex[0] !== "#") return [0, 0, 0];
  const h =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;
  const n = parseInt(h.slice(1), 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

/* ============================== State types ================================= */

export type VelocityCache = {
  lastX: number | null;
  lastY: number | null;
  lastT: number | null; // ms
  smoothed: number; // px/s
  smoothingMs: number;
};

export type GrainPhase = {
  phaseX: number;
  phaseY: number;
  lastHeadX: number | null;
  lastHeadY: number | null;
};

export type TempLayerRegistry = {
  [key: string]: (HTMLCanvasElement | OffscreenCanvas) | undefined;
};

export type SmudgeState = {
  source: HTMLCanvasElement | OffscreenCanvas | null;
  strength: number; // 0..2
  alphaMul: number; // 0..2
  blurPx: number; // >= 0
  spacingOverride?: number;
};

export type BrushContext = {
  width: number;
  height: number;
  dpr: number;
  startedAt: number;
  seed: number;
  rng: RNG;

  colorHex: string;
  colorLinear: [number, number, number];

  velocity: VelocityCache;
  grain: GrainPhase;
  layers: TempLayerRegistry;
  smudge: SmudgeState;

  sampleIndex: number;
  stampIndex: number;

  getTempLayer: (
    key: string,
    pxWidth: number,
    pxHeight: number
  ) => HTMLCanvasElement | OffscreenCanvas;

  ensureSmudgeSource: (fromCanvas: HTMLCanvasElement | OffscreenCanvas) => void;

  updateVelocity: (
    x: number,
    y: number,
    nowMs?: number
  ) => { speed: number; smoothed: number };

  resetPerStrokeCounters(): void;
  dispose(): void;
};

/* ============================== Factory ===================================== */

export type BrushContextInit = {
  width: number;
  height: number;
  dpr: number;
  seed?: number;
  colorHex?: string;
  speedSmoothingMs?: number;
  smudgeDefaults?: {
    strength?: number;
    alphaMul?: number;
    blurPx?: number;
    spacingOverride?: number;
  };
  grainInitialPhase?: { x?: number; y?: number };
  nowMs?: number;

  /** Optional injection to replace the default RNG. */
  rngFactory?: (seed: number) => RNG;
};

export function createBrushContext(init: BrushContextInit): BrushContext {
  const width = Math.max(1, Math.floor(init.width));
  const height = Math.max(1, Math.floor(init.height));
  const dpr = Math.max(1, Math.min(init.dpr || 1, 4));
  const seed = (init.seed ?? 1) >>> 0;
  const rng = (init.rngFactory ?? mulberry32)(seed);

  const colorHex = init.colorHex ?? "#000000";
  const colorLinear = colorHexToLinearRGB(colorHex);

  const velocity: VelocityCache = {
    lastX: null,
    lastY: null,
    lastT: null,
    smoothed: 0,
    smoothingMs: Math.max(0, Math.round(init.speedSmoothingMs ?? 30)),
  };

  const grain: GrainPhase = {
    phaseX: init.grainInitialPhase?.x ?? 0,
    phaseY: init.grainInitialPhase?.y ?? 0,
    lastHeadX: null,
    lastHeadY: null,
  };

  const smudge: SmudgeState = {
    source: null,
    strength: Math.max(0, init.smudgeDefaults?.strength ?? 0.65),
    alphaMul: Math.max(0, init.smudgeDefaults?.alphaMul ?? 0.85),
    blurPx: Math.max(0, init.smudgeDefaults?.blurPx ?? 0),
    spacingOverride: init.smudgeDefaults?.spacingOverride,
  };

  const layers: TempLayerRegistry = Object.create(null);

  const ctx: BrushContext = {
    width,
    height,
    dpr,
    seed,
    rng,
    startedAt: init.nowMs ?? Date.now(),
    colorHex,
    colorLinear,
    velocity,
    grain,
    layers,
    smudge,
    sampleIndex: 0,
    stampIndex: 0,

    getTempLayer(key, pxW, pxH) {
      const w = Math.max(1, Math.floor(pxW));
      const h = Math.max(1, Math.floor(pxH));
      const tag = `${key}:${w}x${h}`;
      const existing = layers[tag];
      if (existing && "width" in existing && "height" in existing) {
        if (existing.width !== w || existing.height !== h) {
          const fresh = createLayer(w, h);
          layers[tag] = fresh;
          return fresh;
        }
        return existing;
      }
      const fresh = createLayer(w, h);
      layers[tag] = fresh;
      return fresh;
    },

    ensureSmudgeSource(fromCanvas) {
      if (!ctx.smudge.source) {
        const src = createLayer(fromCanvas.width, fromCanvas.height);
        const sctx = src.getContext("2d", { alpha: true });
        if (isCtx2D(sctx)) {
          sctx.drawImage(fromCanvas as unknown as CanvasImageSource, 0, 0);
        } else {
          throw new Error("2D context unavailable for smudge snapshot");
        }
        ctx.smudge.source = src;
      }
    },

    updateVelocity(x: number, y: number, nowMs?: number) {
      const t = nowMs ?? Date.now();
      if (
        velocity.lastX == null ||
        velocity.lastY == null ||
        velocity.lastT == null
      ) {
        velocity.lastX = x;
        velocity.lastY = y;
        velocity.lastT = t;
        return { speed: 0, smoothed: velocity.smoothed };
      }
      const dt = Math.max(1, t - velocity.lastT); // ms
      const dx = x - velocity.lastX;
      const dy = y - velocity.lastY;
      const instantaneous = (Math.hypot(dx, dy) * 1000) / dt; // px/s
      const k =
        velocity.smoothingMs <= 0 ? 1 : Math.min(1, dt / velocity.smoothingMs);
      velocity.smoothed =
        velocity.smoothed + k * (instantaneous - velocity.smoothed);
      velocity.lastX = x;
      velocity.lastY = y;
      velocity.lastT = t;
      return { speed: instantaneous, smoothed: velocity.smoothed };
    },

    resetPerStrokeCounters() {
      ctx.sampleIndex = 0;
      ctx.stampIndex = 0;
    },

    dispose() {
      for (const k of Object.keys(layers)) {
        layers[k] = undefined;
        delete layers[k];
      }
      ctx.smudge.source = null;
    },
  };

  return ctx;
}
