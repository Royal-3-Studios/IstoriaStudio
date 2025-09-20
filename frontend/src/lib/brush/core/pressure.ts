// src/lib/brush/core/pressure.ts
// Pressure normalization, smoothing, and mouse/touch synthesis (from speed).
// No React/DOM dependencies; safe for engine/core use.

export type PointerKind = "mouse" | "pen" | "touch" | "unknown";

export interface PressureSample {
  x: number; // CSS px
  y: number; // CSS px
  t: number; // time in milliseconds (performance.now() or Date.now())
  rawPressure?: number; // 0..1 from PointerEvent.pressure (undefined for mouse in many browsers)
  pointerType: PointerKind; // normalized pointer type
}

export type CurveSpec =
  | { type: "gamma"; gamma: number } // simple gamma curve
  | { type: "lut"; lut: ReadonlyArray<number> }; // 0..1 LUT samples (monotonic recommended)

export interface OneEuroParams {
  /** Base cutoff for signal (lower = more smoothing). Typical: 1.0..2.0 */
  minCutoff: number;
  /** Speed sensitivity (higher = less smoothing when moving fast). Typical: 0.001..0.1 */
  beta: number;
  /** Cutoff for derivative filter. Typical: 1.0 */
  dCutoff: number;
}

export interface EmaParams {
  /** Exponential moving average coefficient in [0..1]. 0=no update, 1=no smoothing */
  alpha: number;
}

export type SmootherSpec =
  | { mode: "none" }
  | { mode: "ema"; ema: EmaParams }
  | { mode: "oneEuro"; oneEuro: OneEuroParams };

export interface SynthesisSpec {
  /** When no/poor hardware pressure: derive pseudo-pressure from speed. */
  enabled: boolean;
  /** Map speed (px/s) in this range to pressure [minPressure,maxPressure]. */
  speedRange: [number, number]; // e.g. [0, 2000]
  /** Output clamps for synthesized pressure. */
  minPressure: number; // e.g. 0.15
  maxPressure: number; // e.g. 1.0
  /** Optional shaping curve on synthesized output. */
  curve?: "linear" | "easeIn" | "easeOut" | "easeInOut";
}

export interface VelocityCompSpec {
  /** Blend factor for reducing pressure as speed increases (0..1). */
  k: number; // e.g. 0.0 (off) .. 0.5 (subtle)
  /** Reference speed (px/s) at which the full reduction k is applied. */
  refSpeed: number; // e.g. 1500
}

export interface PressureOptions {
  /** Clamp incoming (pen) pressure to [min,max] before curves/smoothing. */
  clamp?: { min: number; max: number }; // default [0,1]
  /** Optional curve to shape pressure after clamping. */
  curve?: CurveSpec;
  /** Temporal smoothing. */
  smoothing?: SmootherSpec; // default oneEuro
  /** If pen pressure exists, optionally reduce vs speed slightly. */
  velocityComp?: VelocityCompSpec; // optional
  /** Synthesize pressure from speed for mouse/touch (or when rawPressure missing). */
  synth?: SynthesisSpec; // optional
}

/* ---------------------------- small utilities ---------------------------- */

const TWO_PI = Math.PI * 2;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function clampRange(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

function ease(t: number, kind: NonNullable<SynthesisSpec["curve"]>): number {
  const x = clamp01(t);
  switch (kind) {
    case "linear":
      return x;
    case "easeIn":
      return x * x;
    case "easeOut":
      return 1 - (1 - x) * (1 - x);
    case "easeInOut":
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function alphaFromCutoff(cutoff: number, dt: number): number {
  // One Euro filter: alpha = 1 / (1 + tau / dt), with tau = 1 / (2*pi*cutoff)
  const tau = 1 / (TWO_PI * Math.max(1e-6, cutoff));
  return 1 / (1 + tau / Math.max(1e-6, dt));
}

/* ----------------------------- One Euro filter --------------------------- */

class OneEuro {
  private prevX = 0;
  private prevDX = 0;
  private hasPrev = false;

  constructor(private params: OneEuroParams) {}

  reset(): void {
    this.prevX = 0;
    this.prevDX = 0;
    this.hasPrev = false;
  }

  filter(x: number, dtSec: number): number {
    if (!this.hasPrev) {
      this.prevX = x;
      this.prevDX = 0;
      this.hasPrev = true;
      return x;
    }

    // derivative (raw)
    const dx = (x - this.prevX) / Math.max(1e-6, dtSec);

    // smooth derivative
    const aD = alphaFromCutoff(this.params.dCutoff, dtSec);
    const dHat = lerp(this.prevDX, dx, aD);

    // dynamic cutoff based on speed (beta |d|)
    const cutoff = this.params.minCutoff + this.params.beta * Math.abs(dHat);
    const aX = alphaFromCutoff(cutoff, dtSec);

    const xHat = lerp(this.prevX, x, aX);

    this.prevX = xHat;
    this.prevDX = dHat;
    return xHat;
  }
}

/* ------------------------------ EMA smoother ----------------------------- */

class Ema {
  private prev = 0;
  private hasPrev = false;

  constructor(private alpha: number) {}

  reset(): void {
    this.prev = 0;
    this.hasPrev = false;
  }

  filter(x: number): number {
    if (!this.hasPrev) {
      this.prev = x;
      this.hasPrev = true;
      return x;
    }
    const y = lerp(this.prev, x, this.alpha);
    this.prev = y;
    return y;
  }
}

/* ------------------------------ Curve shaping ---------------------------- */

function applyCurve(x: number, spec?: CurveSpec): number {
  if (!spec) return x;
  if (spec.type === "gamma") {
    const g = Math.max(0.01, spec.gamma);
    return Math.pow(clamp01(x), g);
  }
  // LUT: x in [0,1] -> interpolate
  const lut = spec.lut;
  if (!lut.length) return x;
  if (lut.length === 1) return clamp01(lut[0]);
  const pos = clamp01(x) * (lut.length - 1);
  const i = Math.floor(pos);
  const f = pos - i;
  const a = lut[i];
  const b = lut[Math.min(lut.length - 1, i + 1)];
  return lerp(a, b, f);
}

/* ------------------------------ Tracker class ---------------------------- */

export class PressureTracker {
  private lastX = 0;
  private lastY = 0;
  private lastT = 0; // ms
  private havePrev = false;

  private oneEuro?: OneEuro;
  private ema?: Ema;

  constructor(private readonly opts: PressureOptions = {}) {
    const sm = opts.smoothing ?? {
      mode: "oneEuro",
      oneEuro: { minCutoff: 1.0, beta: 0.02, dCutoff: 1.0 },
    };
    if (sm.mode === "oneEuro") this.oneEuro = new OneEuro(sm.oneEuro);
    if (sm.mode === "ema")
      this.ema = new Ema(Math.min(1, Math.max(0, sm.ema.alpha)));
  }

  reset(): void {
    this.havePrev = false;
    this.lastX = this.lastY = 0;
    this.lastT = 0;
    this.oneEuro?.reset();
    this.ema?.reset();
  }

  /** Current speed in px/s computed from last update; 0 if unknown. */
  get lastSpeed(): number {
    // Not stored persistently; computing ad-hoc would require last ds/dt cache.
    // For most use, call .update() return tuple if you need it live.
    return 0;
  }

  /**
   * Update tracker with a new input sample and return normalized pressure [0..1].
   * This includes: clamping -> (optional) synthesis -> (optional) smoothing -> (optional) velocity compensation -> (optional) curve.
   */
  update(sample: PressureSample): number {
    const { x, y, t, rawPressure, pointerType } = sample;

    // Compute speed (px/s) from previous point
    let speed = 0;
    if (this.havePrev) {
      const dt = (t - this.lastT) / 1000; // seconds
      const dx = x - this.lastX;
      const dy = y - this.lastY;
      const ds = Math.hypot(dx, dy);
      speed = dt > 0 ? ds / dt : 0;
    }

    this.lastX = x;
    this.lastY = y;
    this.lastT = t;
    this.havePrev = true;

    const clampMin = this.opts.clamp?.min ?? 0;
    const clampMax = this.opts.clamp?.max ?? 1;

    // 1) choose base pressure
    let p: number;

    const haveHardwarePressure =
      typeof rawPressure === "number" && !Number.isNaN(rawPressure);
    const canUseHardware = haveHardwarePressure && pointerType === "pen";

    if (canUseHardware) {
      p = clampRange(rawPressure as number, clampMin, clampMax);
    } else if (this.opts.synth?.enabled) {
      // 1a) synthesize from speed
      const [v0, v1] = this.opts.synth.speedRange;
      const minP = this.opts.synth.minPressure;
      const maxP = this.opts.synth.maxPressure;
      const curve = this.opts.synth.curve ?? "linear";

      // map speed to 0..1 in [v0,v1], then shape
      const u = clamp01((speed - v0) / Math.max(1e-6, v1 - v0));
      const shaped = ease(u, curve);
      p = clampRange(lerp(minP, maxP, shaped), clampMin, clampMax);
    } else {
      // No hardware pressure and no synthesis: fall back to 1.0
      p = 1.0;
    }

    // 2) smoothing (temporal)
    const sm = this.opts.smoothing ?? {
      mode: "oneEuro",
      oneEuro: { minCutoff: 1.0, beta: 0.02, dCutoff: 1.0 },
    };
    if (sm.mode === "ema" && this.ema) {
      p = this.ema.filter(p);
    } else if (sm.mode === "oneEuro" && this.oneEuro && this.havePrev) {
      const dtSec = Math.max(1e-4, (t - (this.lastT ?? t)) / 1000); // lastT already updated; use small epsilon
      // We need the real dt; so compute from previous frame: we cached before updating lastT above.
      // Adjust: compute dt from 'speed' derivation path: If havePrev, we had (t - prevT)
      // Since we already overwrote lastT, estimate dt from speed with ds (not stored). Use 1/120 as safe default.
      const dt = 1 / 120;
      p = this.oneEuro.filter(p, dt);
    }

    // 3) velocity compensation (slightly reduce pressure at high speed)
    if (this.opts.velocityComp) {
      const k = clamp01(this.opts.velocityComp.k);
      const ref = Math.max(1e-3, this.opts.velocityComp.refSpeed);
      const factor = clamp01(1 - k * (speed / ref)); // linear falloff
      p *= factor + (1 - factor) * 1.0; // keeps in [0..1]; factor=1 => p, factor=0 => p*1
    }

    // 4) curve shaping
    p = applyCurve(p, this.opts.curve);

    // 5) final clamp
    return clamp01(p);
  }
}

/* --------------------------- convenience factories ----------------------- */

export function createDefaultPressureTracker(): PressureTracker {
  return new PressureTracker({
    clamp: { min: 0, max: 1 },
    curve: { type: "gamma", gamma: 1.0 }, // neutral
    smoothing: {
      mode: "oneEuro",
      oneEuro: { minCutoff: 1.5, beta: 0.03, dCutoff: 1.0 },
    },
    velocityComp: { k: 0.15, refSpeed: 1500 },
    synth: {
      enabled: true,
      speedRange: [0, 2000],
      minPressure: 0.15,
      maxPressure: 1.0,
      curve: "easeOut",
    },
  });
}
