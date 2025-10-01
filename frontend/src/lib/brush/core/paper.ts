// FILE: src/lib/brush/core/paper.ts
/**
 * Paper / Material Model
 * ------------------------------------------------------------
 * Lightweight substrate model for backends.
 * - Deterministic per document (seeded RNG)
 * - Cheap evals (cached tiles, lazy maps)
 * - Tooth model with "body" (pepper) and "flank" (edge bias)
 * - Grain pattern with rotation + anchor stability
 * - Simple ink shading curve
 */

import { createLayer, get2DOrNull, type Ctx2D } from "@backends";
import { generateFbmNoiseTexture } from "@/lib/brush/backends/utils/texture";
import { mulberry32 } from "@/lib/brush/backends/utils/random";

/* ========================================================================== *
 * Small helpers
 * ========================================================================== */

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function createLayerPx(
  w: number,
  h: number
): HTMLCanvasElement | OffscreenCanvas {
  return createLayer(Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h)));
}

function require2D(
  c: HTMLCanvasElement | OffscreenCanvas,
  attrs: CanvasRenderingContext2DSettings = { alpha: true }
): Ctx2D {
  const ctx = get2DOrNull(c, attrs);
  if (!ctx) throw new Error("2D context unavailable");
  return ctx;
}

function supportsFilter(ctx: Ctx2D): ctx is CanvasRenderingContext2D {
  // OffscreenCanvasRenderingContext2D may not expose 'filter'
  return "filter" in (ctx as CanvasRenderingContext2D);
}

/* ========================================================================== *
 * Types
 * ========================================================================== */

export type GrainKind = "none" | "paper" | "canvas" | "noise";

export type PaperProfile = {
  /** sRGB paper color hex (background tint) */
  baseColor?: string; // "#ffffff" etc
  /** 0..1: how much ink darkens with tooth body */
  absorb?: number; // default 0.55
  /** 0..1: how much tooth flank carves the rim (destination-out feeling) */
  carve?: number; // default 0.25
  /** grain type used to build patterns */
  grainKind?: GrainKind; // default "paper"
  /** 0.25..4: scales grain tile size (bigger => coarser) */
  grainScale?: number; // default 1.0
  /** degrees: rotates the tiled pattern */
  grainRotate?: number; // default 0
  /** 0..1: pepper/dot strength inside stroke body */
  toothBody?: number; // default 0.5
  /** 0..1: edge tearing strength */
  toothFlank?: number; // default 0.9
  /** px (device): tooth detail tile size (0 = auto) */
  toothScale?: number; // default 0
  /** normal map scale (for impasto/pseudo lighting), 0 disables */
  normalStrength?: number; // default 0
};

export type PaperInit = {
  width: number; // CSS px
  height: number; // CSS px
  dpr: number; // device pixel ratio
  seed?: number; // deterministic per document
  profile?: PaperProfile;
};

export type PaperSystem = {
  // configuration
  width: number;
  height: number;
  dpr: number;
  seed: number;
  profile: Required<PaperProfile>;

  // tooth sampling: returns 0..1 body and flank values at CSS coordinates
  sampleTooth(x: number, y: number): { body: number; flank: number };

  // reusable patterns: use same "anchor" (e.g., stroke head) for stable rotation
  getGrainPattern(
    kind?: GrainKind,
    scale?: number,
    rotateDeg?: number,
    anchor?: { x: number; y: number }
  ): CanvasPattern | null;

  // alpha shading for ink/wash (multiply-like absorption with subtle lift)
  shadeInk(alpha: number, x: number, y: number): number;

  // optional: normal map for lighting backends; lazy built
  getNormalMap(): HTMLCanvasElement | OffscreenCanvas;

  // internals (mostly useful for debugging)
  _getOrBuildToothTiles(): {
    body: HTMLCanvasElement | OffscreenCanvas;
    flank: HTMLCanvasElement | OffscreenCanvas;
  };
  _getOrBuildGrainTile(
    kind: GrainKind,
    tilePx: number
  ): HTMLCanvasElement | OffscreenCanvas;
};

/* ========================================================================== *
 * Implementation
 * ========================================================================== */

const DEFAULT_PROFILE: Required<PaperProfile> = {
  baseColor: "#ffffff",
  absorb: 0.55,
  carve: 0.25,
  grainKind: "paper",
  grainScale: 1.0,
  grainRotate: 0,
  toothBody: 0.5,
  toothFlank: 0.9,
  toothScale: 0,
  normalStrength: 0,
};

export function createPaperSystem(init: PaperInit): PaperSystem {
  const width = Math.max(1, Math.floor(init.width));
  const height = Math.max(1, Math.floor(init.height));
  const dpr = Math.max(1, Math.min(init.dpr || 1, 4));
  const seed = (init.seed ?? 17) >>> 0;

  const profile: Required<PaperProfile> = {
    ...DEFAULT_PROFILE,
    ...(init.profile ?? {}),
  };

  const rng = mulberry32(seed);
  const cache: {
    grainTiles: Map<string, HTMLCanvasElement | OffscreenCanvas>;
    toothTiles?: {
      body: HTMLCanvasElement | OffscreenCanvas;
      flank: HTMLCanvasElement | OffscreenCanvas;
    };
    normalMap?: HTMLCanvasElement | OffscreenCanvas;
  } = {
    grainTiles: new Map(),
  };

  // --- Procedural tiles -----------------------------------------------------

  function makeDotsTile(sizePx: number, density = 1.0) {
    const s = Math.max(8, Math.floor(sizePx));
    const c = createLayerPx(s, s);
    const cx = require2D(c, { alpha: true });
    cx.clearRect(0, 0, s, s);
    cx.fillStyle = "rgba(0,0,0,0.55)";
    const count = Math.max(1, Math.floor((s * s * density) / 160));
    for (let i = 0; i < count; i++) {
      const x = rng.nextFloat() * s;
      const y = rng.nextFloat() * s;
      const r = Math.max(0.35, rng.nextFloat() * 1.4);
      cx.beginPath();
      cx.arc(x, y, r, 0, Math.PI * 2);
      cx.fill();
    }
    return c;
  }

  function makeHatchTile(sizePx: number, thickness = 1) {
    const s = Math.max(8, Math.floor(sizePx));
    const c = createLayerPx(s, s);
    const cx = require2D(c, { alpha: true });
    cx.clearRect(0, 0, s, s);
    cx.strokeStyle = "rgba(0,0,0,0.6)";
    cx.lineWidth = Math.max(0.5, thickness);
    cx.beginPath();
    cx.moveTo(-s * 0.25, s * 0.25);
    cx.lineTo(s * 0.25, -s * 0.25);
    cx.moveTo(s * 0.25, s * 1.25);
    cx.lineTo(s * 1.25, s * 0.25);
    cx.stroke();
    return c;
  }

  function makeNoiseTile(sizePx: number) {
    const s = Math.max(24, Math.min(256, Math.floor(sizePx)));
    const tex = generateFbmNoiseTexture(s, 4, 0.5, 2.0);
    const tile = createLayerPx(tex.width, tex.height);
    const tx = require2D(tile, { alpha: true });
    const id = new ImageData(tex.pixels.data, tex.width, tex.height);
    tx.putImageData(id, 0, 0);
    return tile;
  }

  function getOrBuildGrainTile(kind: GrainKind, tilePx: number) {
    const key = `${kind}:${Math.round(tilePx)}`;
    const hit = cache.grainTiles.get(key);
    if (hit) return hit;

    const c =
      kind === "noise"
        ? makeNoiseTile(tilePx)
        : kind === "canvas"
          ? makeHatchTile(tilePx, Math.max(0.6, tilePx * 0.06))
          : kind === "paper"
            ? makeDotsTile(tilePx, 1.0)
            : (() => {
                // fallback checker
                const s = Math.max(8, Math.floor(tilePx));
                const cc = createLayerPx(s, s);
                const cx = require2D(cc, { alpha: true });
                cx.clearRect(0, 0, s, s);
                const h = Math.floor(s / 2);
                cx.fillStyle = "rgba(0,0,0,0.75)";
                cx.fillRect(0, 0, h, h);
                cx.fillRect(h, h, h, h);
                cx.fillStyle = "rgba(0,0,0,0.15)";
                cx.fillRect(h, 0, h, h);
                cx.fillRect(0, h, h, h);
                return cc;
              })();

    cache.grainTiles.set(key, c);
    return c;
  }

  // Tooth tiles (two-channel idea: body as pepper, flank as edge bias)
  function getOrBuildToothTiles(): {
    body: HTMLCanvasElement | OffscreenCanvas;
    flank: HTMLCanvasElement | OffscreenCanvas;
  } {
    if (cache.toothTiles) return cache.toothTiles;

    const autoTile =
      profile.toothScale > 0
        ? profile.toothScale
        : Math.round(64 * (1 / Math.max(0.35, profile.grainScale)));
    const tile = Math.max(16, Math.min(256, autoTile));

    // base noise
    const base = generateFbmNoiseTexture(tile, 4, 0.5, 2.0);
    const body = createLayerPx(tile, tile);
    const flank = createLayerPx(tile, tile);
    const bctx = require2D(body, { alpha: true });
    const fctx = require2D(flank, { alpha: true });

    // write body: medium contrast pepper
    {
      const id = new ImageData(base.pixels.data, base.width, base.height);
      bctx.putImageData(id, 0, 0);
      bctx.globalCompositeOperation = "overlay";
      bctx.globalAlpha = 0.35;
      bctx.drawImage(body as CanvasImageSource, 0, 0);
      bctx.globalAlpha = 1;
      bctx.globalCompositeOperation = "source-over";
    }
    // write flank: higher contrast, then blur a touch (guard filter)
    {
      const id = new ImageData(base.pixels.data, base.width, base.height);
      fctx.putImageData(id, 0, 0);
      fctx.globalCompositeOperation = "multiply";
      fctx.globalAlpha = 0.65;
      fctx.drawImage(flank as CanvasImageSource, 0, 0);
      fctx.globalCompositeOperation = "source-over";
      if (supportsFilter(fctx)) {
        fctx.filter = "blur(0.3px)";
        fctx.drawImage(flank as CanvasImageSource, 0, 0);
        fctx.filter = "none";
      }
    }

    cache.toothTiles = { body, flank };
    return cache.toothTiles;
  }

  // Optional normal map (from noise) for lighting backends
  function getNormalMap(): HTMLCanvasElement | OffscreenCanvas {
    if (cache.normalMap) return cache.normalMap;
    const W = Math.max(1, Math.floor(width * dpr));
    const H = Math.max(1, Math.floor(height * dpr));
    const nm = createLayerPx(W, H);
    const nx = require2D(nm, { alpha: true });

    const tile = getOrBuildGrainTile("noise", 96);
    const pat = nx.createPattern(tile as CanvasImageSource, "repeat");
    if (pat) {
      nx.fillStyle = pat;
      nx.globalAlpha = 1;
      nx.fillRect(0, 0, W, H);
    }
    // map luminance -> pseudo normal (encode into RGB)
    const img = nx.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722; // 0..255
      const nxC = 128 + (l - 128) * 0.6;
      const nyC = 128 + (128 - l) * 0.6;
      d[i] = nxC;
      d[i + 1] = nyC;
      d[i + 2] = 255;
      d[i + 3] = 255;
    }
    nx.putImageData(img, 0, 0);
    cache.normalMap = nm;
    return nm;
  }

  // Public API
  const api: PaperSystem = {
    width,
    height,
    dpr,
    seed,
    profile,

    sampleTooth(x: number, y: number) {
      const { body, flank } = getOrBuildToothTiles();
      const bx = require2D(body);
      const fx = require2D(flank);
      // map CSS -> device, wrap to tile
      const px = Math.floor((x * dpr) % (body.width as number));
      const py = Math.floor((y * dpr) % (body.height as number));
      const bd = bx.getImageData(px, py, 1, 1).data;
      const fd = fx.getImageData(px, py, 1, 1).data;
      const b = clamp01(bd[0] / 255); // treat red channel as scalar
      const f = clamp01(fd[0] / 255);
      return { body: b, flank: f };
    },

    getGrainPattern(
      kind?: GrainKind,
      scale?: number,
      rotateDeg?: number,
      anchor?: { x: number; y: number }
    ) {
      const useKind = kind ?? profile.grainKind;
      if (useKind === "none") return null;

      const tilePx = Math.max(
        12,
        Math.round(96 * (1 / Math.max(0.35, scale ?? profile.grainScale)))
      );
      const tile = getOrBuildGrainTile(useKind, tilePx);

      const rot = ((rotateDeg ?? profile.grainRotate) * Math.PI) / 180;
      // fast path: no rotation → pattern directly from tile
      if (Math.abs(rot) < 1e-3) {
        const tmp = createLayerPx(tile.width as number, tile.height as number);
        const tx = require2D(tmp, { alpha: true });
        tx.drawImage(tile as CanvasImageSource, 0, 0);
        return tx.createPattern(tmp as CanvasImageSource, "repeat");
      }

      // rotated pattern anchored at a stable point
      const W = Math.max(1, Math.floor(width * dpr));
      const H = Math.max(1, Math.floor(height * dpr));
      const layer = createLayerPx(W, H);
      const lx = require2D(layer, { alpha: true });

      lx.save();
      const ax = Math.floor((anchor?.x ?? 0) * dpr);
      const ay = Math.floor((anchor?.y ?? 0) * dpr);
      lx.translate(ax, ay);
      lx.rotate(rot);
      lx.translate(-ax, -ay);
      const patSrc = lx.createPattern(tile as CanvasImageSource, "repeat");
      if (patSrc) {
        lx.fillStyle = patSrc;
        lx.fillRect(0, 0, W, H);
      }
      lx.restore();

      return lx.createPattern(layer as CanvasImageSource, "repeat");
    },

    shadeInk(alpha: number, x: number, y: number): number {
      // Basic model: alpha’ = alpha * (1 + absorb * (b*0.8 + f*0.2)) with slight carve lift
      const t = api.sampleTooth(x, y);
      const gain = profile.absorb * (t.body * 0.8 + t.flank * 0.2);
      let a = alpha * (1 + gain);
      a *= 1 - profile.carve * 0.15 * t.flank; // subtle edge lift
      return clamp01(a);
    },

    getNormalMap,

    _getOrBuildToothTiles: getOrBuildToothTiles,
    _getOrBuildGrainTile: getOrBuildGrainTile,
  };

  return api;
}
