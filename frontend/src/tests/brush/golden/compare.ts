// FILE: tests/brush/golden/compare.ts
// Pixel diff with tolerances for golden tests.
// Works with Vitest/Jest or plain Node by throwing on failure.

import { compareImageData } from "./render";

/** Thresholds for deciding whether two images are "close enough". */
export type DiffThresholds = {
  /** Per-channel tolerance (0..255). Channels within ±t are considered equal for outlier counting. */
  perChannelTolerance?: number;
  /** Maximum mean absolute error across all RGBA channels (0..255). */
  maxMae?: number;
  /** Maximum root-mean-square error across all RGBA channels (0..255). */
  maxRmse?: number;
  /** Maximum fraction (0..1) of channels that exceed perChannelTolerance. */
  maxOutlierFrac?: number;
  /** If true, ignore alpha channel for stats/outliers. */
  ignoreAlpha?: boolean;
  /** If >0, generate a diff ImageData with this amplification factor for debugging. */
  diffAmplify?: number;
};

export type DiffResult = {
  ok: boolean;
  message: string;
  mae: number;
  rmse: number;
  outlierFrac: number;
  /** Optional visualization of abs(channelA-channelB) * amplify (RGBA). */
  diff?: ImageData;
};

/** Build a diff visualization (absolute channel differences). */
function makeDiffImage(
  a: ImageData,
  b: ImageData,
  amplify = 4,
  ignoreAlpha = false
): ImageData {
  const { width, height } = a;
  const out = new ImageData(width, height);
  const ad = a.data;
  const bd = b.data;
  const od = out.data;

  for (let i = 0; i < ad.length; i += 4) {
    const dr = Math.abs(ad[i]! - bd[i]!);
    const dg = Math.abs(ad[i + 1]! - bd[i + 1]!);
    const db = Math.abs(ad[i + 2]! - bd[i + 2]!);
    const da = Math.abs(ad[i + 3]! - bd[i + 3]!);

    od[i] = Math.min(255, Math.round(dr * amplify));
    od[i + 1] = Math.min(255, Math.round(dg * amplify));
    od[i + 2] = Math.min(255, Math.round(db * amplify));
    od[i + 3] = ignoreAlpha ? 255 : Math.min(255, Math.round(da * amplify));
  }
  return out;
}

/** Compute stats with optional alpha-ignore. */
function compareWithOptions(
  a: ImageData,
  b: ImageData,
  perChannelTolerance = 0,
  ignoreAlpha = false
) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `Size mismatch: ${a.width}×${a.height} vs ${b.width}×${b.height}`
    );
  }

  // If ignoring alpha, clone and set alpha to 255 to remove its influence.
  if (!ignoreAlpha) return compareImageData(a, b, perChannelTolerance);

  const ad = new Uint8ClampedArray(a.data);
  const bd = new Uint8ClampedArray(b.data);
  for (let i = 3; i < ad.length; i += 4) {
    ad[i] = 255;
    bd[i] = 255;
  }
  const a2 = new ImageData(ad, a.width, a.height);
  const b2 = new ImageData(bd, b.width, b.height);
  return compareImageData(a2, b2, perChannelTolerance);
}

/**
 * Compare two ImageData buffers. Returns stats and optional diff image.
 * Does not throw; use `assertImagesClose` to fail tests.
 */
export function diffImages(
  a: ImageData,
  b: ImageData,
  thresholds: DiffThresholds = {}
): DiffResult {
  const {
    perChannelTolerance = 0,
    maxMae = 0,
    maxRmse = 0,
    maxOutlierFrac = 0,
    ignoreAlpha = false,
    diffAmplify = 0,
  } = thresholds;

  const { mae, rmse, outlierFrac } = compareWithOptions(
    a,
    b,
    perChannelTolerance,
    ignoreAlpha
  );

  const ok = mae <= maxMae && rmse <= maxRmse && outlierFrac <= maxOutlierFrac;

  const msgLines = [
    `MAE=${mae.toFixed(3)} (≤ ${maxMae})`,
    `RMSE=${rmse.toFixed(3)} (≤ ${maxRmse})`,
    `OutlierFrac=${outlierFrac.toFixed(5)} (≤ ${maxOutlierFrac})`,
    `perChannelTolerance=${perChannelTolerance}, ignoreAlpha=${ignoreAlpha}`,
  ];

  const result: DiffResult = {
    ok,
    message: msgLines.join(" | "),
    mae,
    rmse,
    outlierFrac,
  };

  if (!ok && diffAmplify > 0) {
    result.diff = makeDiffImage(a, b, diffAmplify, ignoreAlpha);
  }

  return result;
}

/**
 * Assert two ImageData buffers are within thresholds.
 * Throws (failing the test) with a helpful message.
 */
export function assertImagesClose(
  a: ImageData,
  b: ImageData,
  thresholds: DiffThresholds = {}
): void {
  const res = diffImages(a, b, thresholds);
  if (!res.ok) {
    throw new Error(`Golden image drift exceeded thresholds.\n${res.message}`);
  }
}

/**
 * Vitest/Jest sugar: returns a function you can use like
 *   expect(render()).resolves.toSatisfy(await expectImagesClose(golden, opts))
 * but more commonly you’ll just:
 *   const out = await renderToImageData(...);
 *   assertImagesClose(out, golden, { maxMae: 0.45, maxRmse: 1.2, perChannelTolerance: 2, diffAmplify: 8 });
 */
export function expectImagesClose(
  golden: ImageData,
  thresholds: DiffThresholds
) {
  return (out: ImageData) => {
    assertImagesClose(out, golden, thresholds);
    return true;
  };
}
