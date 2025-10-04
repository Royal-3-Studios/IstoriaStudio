// src/lib/brush/backends/spray/core/distribution.ts
import type { Stamp } from "@/lib/brush/backends/utils/stroke";

export type DensityParams = {
  dotsPerStepBase: number;
  dotsJitter01: number; // 0..1
  speedToDensity: number; // -1..+1
  rand: () => number;
};

export function dotsThisStep(
  stamps: ReadonlyArray<Stamp>,
  i: number,
  p: DensityParams
): number {
  const kJ = 1 + p.dotsJitter01 * (p.rand() * 2 - 1);
  const speedDensityGain =
    p.speedToDensity !== 0 && i > 0
      ? 1 +
        p.speedToDensity *
          Math.min(
            1.0,
            Math.abs(stamps[i]!.tangentDeg - stamps[i - 1]!.tangentDeg) / 45
          )
      : 1;
  return Math.max(1, Math.round(p.dotsPerStepBase * kJ * speedDensityGain));
}
