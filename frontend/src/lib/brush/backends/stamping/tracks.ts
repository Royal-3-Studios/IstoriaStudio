// ========================
// FILE: src/lib/brush/backends/stamping/tracks.ts
// ========================
import { Rand } from "@backends";
import { segmentNormal } from "./utils";

export function forEachTrack(
  seed: number,
  splitCount: number,
  splitSpacing: number,
  splitSpacingJitter: number, // 0..1
  pressureToSplitSpacing: number, // 0..1
  splitCurvature: number, // -1..1
  splitAsymmetry: number, // -1..1
  splitScatter: number, // px
  fanAngleRad: number,
  tMid: number,
  pMid: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cb: (
    oxA: number,
    oyA: number,
    oxB: number,
    oyB: number,
    r: () => number
  ) => void
) {
  const { nx, ny } = segmentNormal(ax, ay, bx, by);
  const c = Math.cos(fanAngleRad);
  const s = Math.sin(fanAngleRad);
  const rx = c * nx - s * ny;
  const ry = s * nx + c * ny;

  for (let k = 0; k < splitCount; k++) {
    const rTrack = Rand.mulberry32((seed ^ 0x1000) + k * 97);
    const randF = () => rTrack.nextFloat();

    const center = (splitCount - 1) / 2;
    const baseSep = splitSpacing * (k - center);
    const jittered = baseSep * (1 + (randF() * 2 - 1) * splitSpacingJitter);

    const pressSep = 1 + pressureToSplitSpacing * ((pMid - 0.5) * 2);
    const curve = 1 + splitCurvature * (2 * tMid - 1);
    const asym = 1 + splitAsymmetry * ((k - center) / (center || 1));

    const sep = jittered * pressSep * curve * asym;
    const sc = splitScatter > 0 ? (randF() * 2 - 1) * splitScatter : 0;

    const ox = rx * sep + nx * sc;
    const oy = ry * sep + ny * sc;

    cb(ax + ox, ay + oy, bx + ox, by + oy, randF);
  }
}
