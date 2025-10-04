// FILE: src/lib/brush/backends/ribbon/core/tuning.ts

/** Per-variant tuning constants for ribbon shading & feel. */
export interface RibbonTuning {
  /** Scales the body width relative to base radius (pencil thinner; ink thicker). */
  bodyWidthScale: number;

  // Tip shaping
  taperRadiusFactor: number; // scales how quickly tips narrow (× base radius)
  taperMinPx: number; // hard floor of taper denominator (px)
  taperMaxPx: number; // hard ceiling of taper denominator (px)
  tipSharpenBoost: number; // increases sharpen near tips (0..1)
  midBoostAmt: number; // fattens mid-body (0..1)

  // Glaze/plate/spine amounts
  glazeBlurPx: number;
  glaze1Alpha: number;
  glaze2Alpha: number;
  plateAlpha: number;
  spineAlpha: number;

  // Opacity spine
  opacitySpineAlpha: number;
  opacitySpineBlurK: number;
  opacitySpineWidth: number;

  // Edge polish / sheen (pencil only typically)
  rimAlpha: number;

  // Grain defaults
  grainDepthDefault: number;
  grainScaleDefault: number;
  grainAnisoX: number;
  grainAnisoY: number;

  // Micro jitter along centerline
  microJitterPx: number;
  microJitterFreq: number;

  // Tip minimum alpha at ends (for destination-in fade)
  tipMinAlpha: number;

  // Fine dust pass
  fineDustAlphaK: number;
  fineDustScaleDiv: number;
  fineDustRotateK: number;
}

export const TUNING_PENCIL: RibbonTuning = {
  bodyWidthScale: 0.42,

  taperRadiusFactor: 26,
  taperMinPx: 240,
  taperMaxPx: 770,
  tipSharpenBoost: 0.26,
  midBoostAmt: 0.15,

  glazeBlurPx: 0.52,
  glaze1Alpha: 0.62,
  glaze2Alpha: 0.34,
  plateAlpha: 0.16,
  spineAlpha: 0.26,

  opacitySpineAlpha: 0.4,
  opacitySpineBlurK: 0.55,
  opacitySpineWidth: 1.6,

  rimAlpha: 0.18,

  grainDepthDefault: 0.34,
  grainScaleDefault: 1.4,
  grainAnisoX: 0.7,
  grainAnisoY: 1.35,

  microJitterPx: 0.22,
  microJitterFreq: 0.16,

  tipMinAlpha: 0.25,

  fineDustAlphaK: 0.08,
  fineDustScaleDiv: 3.0,
  fineDustRotateK: 0.4,
};

export const TUNING_INK: RibbonTuning = {
  ...TUNING_PENCIL,
  bodyWidthScale: 0.52,
  midBoostAmt: 0.0,
  tipSharpenBoost: 0.18,

  glazeBlurPx: 0.28,
  glaze1Alpha: 0.42,
  glaze2Alpha: 0.28,
  plateAlpha: 0.22,
  spineAlpha: 0.55,

  opacitySpineAlpha: 0.68,
  opacitySpineBlurK: 0.42,
  opacitySpineWidth: 1.1,

  rimAlpha: 0.0,

  tipMinAlpha: 0.96,

  microJitterPx: 0.06,
  microJitterFreq: 0.12,

  grainDepthDefault: 0.0,
};

export type RibbonVariant = "pencil" | "ink" | "calligraphy" | "marker";

/** Choose a preset; calligraphy & marker currently map to pencil/ink defaults. */
export function pickTuning(variant: RibbonVariant): RibbonTuning {
  switch (variant) {
    case "ink":
    case "marker":
      return TUNING_INK;
    case "calligraphy":
    case "pencil":
    default:
      return TUNING_PENCIL;
  }
}
