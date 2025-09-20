// src/lib/brush/core/dynamics.ts
import type { ModRoute, ModTarget, CurvePoint } from "@/lib/brush/core/types";
import { buildLUT, sampleLUT } from "../backends/utils/curves";
import { clamp, clamp01 } from "../backends/utils/math";
import type { RNG } from "../backends/utils/random";

/** Values that can drive modulation each stamp / sample. All normalized to 0..1 where applicable. */
export type ModulationContext = {
  pressure?: number; // 0..1
  speed?: number; // normalized 0..1 (you choose mapping)
  tilt?: number; // 0..1 (0 = perpendicular, 1 = parallel). Or use altitude/azimuth below.
  tiltAltitude?: number; // 0..1 (1 = stylus upright)
  tiltAzimuth?: number; // 0..1 (heading mapped to 0..1)
  random?: number; // 0..1 (if omitted and rng provided, we’ll generate)
  strokePos?: number; // 0..1 along the stroke
  stampIndex?: number; // 0..1 normalized index within the stroke
  direction?: number; // 0..1 from heading (e.g., deg/360)
  rng?: RNG; // optional RNG to generate random when random is undefined
};

/** Internal, compiled route with baked LUT and defaults. */
type CompiledRoute = {
  target: ModTarget;
  amount: number;
  mode: "add" | "mul" | "replace";
  min?: number;
  max?: number;
  input: keyof ModulationContext; // which ctx field
  lut?: Float32Array; // optional remap LUT
};

/** Compile user routes into a fast structure (with LUTs). */
export function compileRoutes(
  routes: ModRoute[] | undefined,
  lutSize = 256
): CompiledRoute[] {
  if (!routes || routes.length === 0) return [];
  const out: CompiledRoute[] = [];
  for (const r of routes) {
    if (!r || !r.input || !r.target) continue;
    let lut: Float32Array | undefined;
    if (r.curve && r.curve.length >= 2) {
      lut = buildLUT(r.curve as CurvePoint[], lutSize);
    }
    out.push({
      target: r.target,
      amount: typeof r.amount === "number" ? r.amount : 1,
      mode: r.mode ?? "add",
      min: typeof r.min === "number" ? r.min : undefined,
      max: typeof r.max === "number" ? r.max : undefined,
      input: r.input as keyof ModulationContext,
      lut,
    });
  }
  return out;
}

/** Resolve the input value from context, generating randomness if desired. */
function readInput(route: CompiledRoute, ctx: ModulationContext): number {
  const k = route.input;
  if (k === "random") {
    if (typeof ctx.random === "number") return clamp01(ctx.random);
    if (ctx.rng) return ctx.rng.nextFloat();
    return Math.random();
  }
  const v = ctx[k];
  return clamp01(typeof v === "number" ? v : 0);
}

/** Apply a single compiled route to a base value, return adjusted value. */
function applyRoute(
  base: number,
  route: CompiledRoute,
  ctx: ModulationContext
): number {
  const raw = readInput(route, ctx); // 0..1
  const mapped = route.lut ? sampleLUT(route.lut, raw) : raw; // remapped 0..1
  let out = base;

  switch (route.mode) {
    case "add":
      // add a delta scaled by amount, commonly amount in "units of base param"
      out = base + route.amount * mapped;
      break;
    case "mul":
      // multiplicative modulation around 1. amount is a gain on the mapped factor.
      // mapped in [0,1] -> scale in [1-amount, 1+amount] if you want symmetric effect:
      // choose the policy; here we interpret amount as a direct multiplier of (1 + mapped*amount)
      out = base * (1 + route.amount * mapped);
      break;
    case "replace":
      // amount works like lerp weight between base and mappedValueScaled.
      // If you need "absolute scale", interpret mapped in [0,1] as absolute target
      // and amount as blend weight.
      out = base * (1 - route.amount) + mapped * route.amount;
      break;
  }

  if (route.min != null || route.max != null) {
    out = clamp(out, route.min ?? -Infinity, route.max ?? Infinity);
  }
  return out;
}

/** Stateless modulator that can apply all routes to target values. */
export class Modulator {
  private byTarget: Map<ModTarget, CompiledRoute[]>;
  constructor(compiled: CompiledRoute[]) {
    // bucket routes per target for fast lookup
    this.byTarget = new Map();
    for (const r of compiled) {
      const arr = this.byTarget.get(r.target);
      if (arr) arr.push(r);
      else this.byTarget.set(r.target, [r]);
    }
  }

  /** Apply modulation to a single target value. */
  apply(target: ModTarget, base: number, ctx: ModulationContext): number {
    const routes = this.byTarget.get(target);
    if (!routes || routes.length === 0) return base;
    let v = base;
    for (const r of routes) {
      v = applyRoute(v, r, ctx);
    }
    return v;
  }

  /**
   * Apply modulation to a set of base values at once.
   * Only keys present in `baseByTarget` are returned (i.e., no implicit creation).
   */
  applyAll(
    baseByTarget: Partial<Record<ModTarget, number>>,
    ctx: ModulationContext
  ): Partial<Record<ModTarget, number>> {
    const out: Partial<Record<ModTarget, number>> = {};
    for (const [target, base] of Object.entries(baseByTarget) as Array<
      [ModTarget, number]
    >) {
      out[target] = this.apply(target, base, ctx);
    }
    return out;
  }
}

/** Convenience: build a Modulator directly from user routes. */
export function buildModulator(routes?: ModRoute[], lutSize = 256): Modulator {
  return new Modulator(compileRoutes(routes, lutSize));
}

/* ===========================
   EXAMPLE USAGE (in backends)
   ---------------------------
   // Build once per brush/preset (or per stroke if routes change)
   const mod = buildModulator(engine.modulations?.routes);

   // Per stamp/sample:
   const ctx: ModulationContext = {
     pressure, speed, strokePos, stampIndex, direction, rng,
   };

   const size    = mod.apply("size", baseSize, ctx);
   const flow    = mod.apply("flow", baseFlow, ctx);
   const spacing = mod.apply("spacing", baseSpacing, ctx);
   // ...
   =========================== */
