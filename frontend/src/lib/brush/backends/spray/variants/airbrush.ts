// FILE: src/lib/brush/backends/spray/airbrush.ts
import type { RenderOptions, RenderOverrides } from "@/lib/brush/engine.types";
import { Rand } from "@backends/utils/random";
import * as TexUtil from "@backends/utils/texture";
import * as Blend from "@backends/utils/blending";
import { pathToStamps, type InputQualityOpts } from "@backends/utils/stroke";
import type { PressureMapOpts } from "@/lib/brush/core/pressure";
import {
  avgTiltFromPath,
  getTiltOverrides,
  fanFromTilt,
  sizeMulFromTilt,
} from "@backends/stamping/utils/scalars"; // ← shared tilt helpers
import type { Ctx2D } from "@backends/utils/canvas";
import { get2D } from "@backends/utils/canvas";
import { paintDroplet, gaussianRadius } from "../core/droplet";
import {
  radialFalloff,
  pressureToSize,
  pressureToAlpha,
} from "../core/falloff";
import { dotsThisStep } from "../core/emitter";

import {
  newMask,
  newColorLayer,
  clipColorByMask,
  buildGrainLayerFromTile,
  multiplyGrainOverColor,
} from "../core/mask";
import { jitterColorHSLA } from "@backends/utils/color";

/** Per-backend knobs for spray. All are optional. */
export type SprayBackendOverrides = Partial<{
  dropletCount: number; // baseline density (dots per stamp step)
  dropletJitter: number; // 0..1 density jitter per step
  dropletSizeMin: number; // clamp for radius
  dropletSizeMax: number; // clamp for radius
  sizeJitter: number; // 0..1 size jitter per droplet
  alphaMin: number; // 0..1 alpha clamp
  alphaMax: number; // 0..1 alpha clamp
  speedToDensity: number; // -1..+1: add/remove dots at speed
  colorJitter?: { h?: number; s?: number; l?: number; perDroplet?: boolean };
}>;

/* ───────────────────────────── helpers (typed; exact-optional safe) ───────────────────────────── */

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

/** Build PressureMapOpts from input curve/clamp, omitting undefined keys (for exactOptionalPropertyTypes). */
function toPressureMapFromInput(
  opt: RenderOptions
): PressureMapOpts | undefined {
  const input = opt.input;
  if (!input || !input.pressure) return undefined;

  const gamma =
    input.pressure.curve?.type === "gamma"
      ? input.pressure.curve.gamma
      : undefined;
  const deadZone =
    typeof input.pressure.clamp?.min === "number"
      ? clamp(input.pressure.clamp.min, 0, 0.5)
      : undefined;

  const o: Partial<PressureMapOpts> = {};
  if (gamma !== undefined) o.gamma = gamma;
  if (deadZone !== undefined) o.deadZone = deadZone;

  return Object.keys(o).length ? (o as PressureMapOpts) : undefined;
}

/** Build InputQualityOpts from opt.input.quality, omitting undefined keys. */
function buildInputQualityFromOptions(
  opt: RenderOptions
): InputQualityOpts | undefined {
  const q = opt.input?.quality;
  if (!q) return undefined;

  const iq: Partial<InputQualityOpts> = {};
  if (typeof q.predictPx === "number") iq.predictPx = q.predictPx;
  if (typeof q.speedToSpacing === "number")
    iq.speedToSpacing = q.speedToSpacing;
  if (typeof q.minStepPx === "number") iq.minStepPx = q.minStepPx;

  return Object.keys(iq).length ? (iq as InputQualityOpts) : undefined;
}

/** Classic “soft” airbrush with tilt→elliptical footprint/spread */
export function drawSprayAirbrush(ctx: Ctx2D, opt: RenderOptions): void {
  const path = opt.path ?? [];
  if (path.length < 2) return;

  const viewW = Math.max(1, Math.floor(opt.width));
  const viewH = Math.max(1, Math.floor(opt.height));

  // Flow/opacity (0..100 UI → 0..1)
  const ov = (opt.engine.overrides ?? {}) as Partial<RenderOverrides>;
  const flow01 = clamp01(((ov.flow ?? 100) as number) / 100);
  const opacity01 = clamp01(((ov.opacity ?? 100) as number) / 100);

  // Tilt routing gains + measured tilt
  const { tiltToFan, tiltToSize } = getTiltOverrides(ov);
  const avgTilt01 = avgTiltFromPath(path);

  // Derived scalars from tilt
  const fan = fanFromTilt(avgTilt01, tiltToFan); // >1: stretch along tangent
  const sizeMulTilt = sizeMulFromTilt(avgTilt01, tiltToSize); // gentle droplet radius boost

  // Per-backend spray overrides
  const spr =
    (opt.engine.backendOverrides?.spray as SprayBackendOverrides | undefined) ??
    {};
  const dotsPerStepBase = Math.max(
    1,
    Math.round(
      (spr.dropletCount ??
        opt.engine.strokePath?.count ??
        (ov.count as number | undefined) ??
        16) as number
    )
  );
  const dotsJitter01 = clamp01(spr.dropletJitter ?? 0);
  const speedToDensity = Math.max(-1, Math.min(1, spr.speedToDensity ?? 0));

  // Stroke/placement inputs
  const spacingPercent = (opt.engine.strokePath?.spacing ??
    (ov.spacing as number | undefined) ??
    6) as number;

  const jitterPercent =
    ((opt.engine.strokePath?.jitter ??
      (ov.jitter as number | undefined) ??
      0.5) as number) * 100;

  const scatterPx = (opt.engine.strokePath?.scatter ??
    (ov.scatter as number | undefined) ??
    0) as number;

  // Randomness
  const seed = (opt.seed ?? 1337) >>> 0;
  const rng = new Rand(seed);
  const rand = (): number => rng.nextFloat();

  // Pressure mapping + input quality (omit empty)
  const pmap = toPressureMapFromInput(opt);
  const inputQuality = buildInputQualityFromOptions(opt);

  // Build stamp options with only defined optional blocks
  const baseStampOpts = {
    baseSizePx: opt.baseSizePx,
    spacingPercent,
    jitterPercent,
    scatterPx,
    stampsPerStep: 1,
    streamline: opt.engine.strokePath?.streamline ?? 0,
    angleFollowDirection: 0,
    angleJitterDeg: 0,
    tipMinPx: 0,
    tipScaleStart: 0.85,
    tipScaleEnd: 0.85,
    taperProfileStart: "linear" as const,
    taperProfileEnd: "linear" as const,
    endBias: 0,
    uniformity: 0,
    rng,
  } as const;

  const stamps = pathToStamps(path, {
    ...baseStampOpts,
    ...(pmap ? { pressureMap: pmap } : {}),
    ...(inputQuality ? { inputQuality } : {}),
  });
  if (!stamps.length) return;

  // Color/size clamps & jitter
  const color = opt.color ?? "#000000";
  const baseR = Math.max(0.25, (opt.baseSizePx || 6) * 0.35);
  const sizeMin = Math.max(0, spr.dropletSizeMin ?? 0);
  const sizeMax = Math.max(
    sizeMin,
    spr.dropletSizeMax ?? Number.POSITIVE_INFINITY
  );
  const sizeJitter = clamp01(spr.sizeJitter ?? 0);
  const alphaMin = clamp01(spr.alphaMin ?? 0);
  const alphaMax = clamp01(spr.alphaMax ?? 1);

  // Nominal step estimate (for scatter baseline and speed→density)
  const nominalStepPx = Math.max(
    0.6,
    (spacingPercent > 1 ? spacingPercent / 100 : spacingPercent) *
      (opt.baseSizePx || 6)
  );

  // Working layers
  const { mask, mx } = newMask(viewW, viewH);
  const { colorLayer, cx } = newColorLayer(viewW, viewH);
  const cj = spr.colorJitter;

  for (let i = 0; i < stamps.length; i++) {
    const s = stamps[i]!;
    const prev = i > 0 ? stamps[i - 1]! : s;
    const segL = Math.hypot(s.x - prev.x, s.y - prev.y);

    // Density for this step (speed/pressure/jitter aware)
    const dots = dotsThisStep(
      { dotsPerStepBase, dotsJitter01, speedToDensity },
      rand,
      { localSegPx: segL, nominalStepPx },
      s.pressure
    );

    // Stroke tangent (radians) for local ellipse orientation
    const tanRad = (s.tangentDeg * Math.PI) / 180;
    const ct = Math.cos(tanRad);
    const st = Math.sin(tanRad);

    for (let k = 0; k < dots; k++) {
      // Sample a point in an ellipse aligned to the stroke:
      // major radius ∝ fan, minor ∝ 1/fan
      const rr = radialFalloff(rand()); // 0..1 (biased to center)
      const phi = rand() * Math.PI * 2; // local angle within ellipse
      const base = scatterPx + nominalStepPx * 0.5;
      const major = base * fan;
      const minor = base / Math.max(1e-6, fan);

      // Local ellipse coords → world via rotation by tangent
      const dxLocal = rr * Math.cos(phi) * major;
      const dyLocal = rr * Math.sin(phi) * minor;
      const px = s.x + dxLocal * ct - dyLocal * st;
      const py = s.y + dxLocal * st + dyLocal * ct;

      // Size & alpha vs pressure (+ tilt size multiplier)
      const sizeMulP = pressureToSize(s.pressure, 0.85);
      const rCore = gaussianRadius(
        baseR * (0.6 + 0.9 * sizeMulP) * sizeMulTilt,
        rand
      );
      const rJitMul = sizeJitter
        ? lerp(1 - sizeJitter, 1 + sizeJitter, rand())
        : 1;
      const radiusRaw = rCore * rJitMul;
      const radius = Math.max(sizeMin, Math.min(sizeMax, radiusRaw));

      const alphaMul = pressureToAlpha(s.pressure, 1.2);
      const aCore = flow01 * (0.75 + 0.25 * rand()) * alphaMul;
      const alpha = Math.max(alphaMin, Math.min(alphaMax, clamp01(aCore)));

      // 1) Accumulate mask (opaque)
      paintDroplet(mx, {
        x: px,
        y: py,
        radius,
        alpha: 1,
        color: "#000",
        shape: "circle",
      });

      // 2) Color layer with optional HSL jitter
      const tint = cj?.perDroplet
        ? jitterColorHSLA(color, cj, rng, alpha)
        : color;
      paintDroplet(cx, {
        x: px,
        y: py,
        radius,
        alpha,
        color: tint,
        shape: "circle",
      });
    }
  }

  // Keep color only where mask exists
  clipColorByMask(cx, mask);

  // Optional paper/canvas grain
  const useGrain = (opt.engine.grain?.kind ?? "none") !== "none";
  if (useGrain) {
    const grainScale = opt.engine.grain?.scale ?? 1.0;
    const grainRotateDeg = opt.engine.grain?.rotate ?? 0;
    const tileSize = Math.max(
      24,
      Math.round(((opt.baseSizePx || 6) * 6) / Math.max(0.35, grainScale))
    );

    const tex = TexUtil.generateFbmNoiseTexture(
      Math.max(24, Math.min(256, tileSize)),
      4, // octaves
      0.5, // persistence
      2.0 // lacunarity
    );
    const id = new ImageData(tex.pixels.data, tex.width, tex.height);

    const head = stamps[0]!;
    const { grainLayer } = buildGrainLayerFromTile(
      id,
      viewW,
      viewH,
      0.22 * flow01,
      (grainRotateDeg * Math.PI) / 180,
      { x: head.x, y: head.y }
    );

    // Mask grain by spray presence, then multiply into color
    const gx = get2D(grainLayer);
    clipColorByMask(gx, mask);
    multiplyGrainOverColor(cx, grainLayer);
  }

  // Composite to destination (engine still applies global blend/opacity)
  Blend.withCompositeAndAlpha(ctx, "source-over", opacity01, (): void => {
    ctx.drawImage(colorLayer, 0, 0);
  });
}
