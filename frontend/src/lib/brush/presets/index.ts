import type { ParticleOptions } from "../backends/particle/types";
import type { RibbonOptions } from "../backends/ribbon/types";
import type { SmudgeOptions } from "../backends/smudge/types";
import type { SprayOptions } from "../backends/spray/types";
import { STOCK_CURVES } from "../curves/stock";
import type { RenderOverrides } from "@/lib/brush/engine.types";

export type BrushPreset = {
  name: string;
  category: string;
  backend: "ribbon" | "spray" | "smudge" | "particle";
  baseSizePx: number;
  engine?: { overrides?: RenderOverrides };
  ribbon?: RibbonOptions;
  spray?: SprayOptions;
  smudge?: SmudgeOptions;
  particle?: ParticleOptions;
};

export const BRUSH_PRESETS: BrushPreset[] = [
  {
    name: "Soft Airbrush",
    category: "Airbrushing",
    backend: "spray",
    baseSizePx: 20,
    engine: { overrides: { flow: 60 } },
    spray: { sigmaPx: 20, hardness: 40, noiseAmount: 0.1 },
  },
  {
    name: "Marker Pen",
    category: "Inking",
    backend: "ribbon",
    baseSizePx: 9,
    ribbon: { spacing: 0.3, streamline: 25 },
  },
  {
    name: "Grunge Splatter",
    category: "Particle",
    backend: "particle",
    baseSizePx: 14,
    particle: {
      emitRatePerSec: 250,
      lifeMs: 900,
      sizeMinPx: 1,
      sizeMaxPx: 3,
      speedMin: 150,
      speedMax: 400,
      dragPerSec: 0.12,
      gravity: 900,
      angleSpreadRad: Math.PI * 0.2, // ← REQUIRED
      splatterProb: 0.3,
      dripGravity: 600,
      dripStretch: 0.4,
      noiseAmount: 0.15,
      noiseScalePx: 64,
      decal: { kind: "round" }, // ← REQUIRED
      inkMode: "inner-grain",
      antiHaloPx: 0.5,
      antiHaloAlpha: 0.4,
    },
  },
];
