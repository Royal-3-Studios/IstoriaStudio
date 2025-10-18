// FILE: src/lib/brush/backends/particle/core/particle.ts
import type {
  RenderOptions,
  RenderOverrides,
  EngineStrokePath,
  RenderPathPoint,
} from "@/lib/brush/engine.types";
import type { CanvasLike } from "@/lib/brush/backends/utils/canvas";
import type { ParticleOptions, DrawParticleToCanvas } from "../types";
import { stampParticle } from "./stamp";

/* ------------------------------- utilities -------------------------------- */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const num = (v: unknown, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : d;

function must<T>(v: T | null | undefined, where: string): T {
  if (v == null) throw new Error(`particle: ${where} is undefined`);
  return v;
}

const pressure01 = (pt: { p?: number; pressure?: number }) =>
  clamp01(
    typeof pt.p === "number"
      ? pt.p
      : typeof pt.pressure === "number"
        ? pt.pressure
        : 1
  );

const hypot = (dx: number, dy: number) => Math.hypot(dx, dy);

/** Try HTML canvas 2D; your utils typically handle Offscreen elsewhere. */
function getCtx(surface: CanvasLike): CanvasRenderingContext2D {
  const ctx = (surface as HTMLCanvasElement).getContext("2d");
  return must(ctx as CanvasRenderingContext2D | null, "2D context");
}

/** Normalize path to a concrete array (safe for strict TS). */
function toPoints(
  path: EngineStrokePath | Iterable<RenderPathPoint>
): RenderPathPoint[] {
  return Array.isArray(path)
    ? (path as unknown as RenderPathPoint[])
    : Array.from(path as Iterable<RenderPathPoint>);
}

/** Tiny RNG (mulberry32). */
function makeRng(seed: number): () => number {
  let t = seed >>> 0 || 1;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cheap “value-ish” noise (used to modulate alpha). */
function noise2(rng: () => number, x: number, y: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  const f = s - Math.floor(s);
  return (f + rng()) * 0.5; // 0..1
}

/* --------------------------------- types ---------------------------------- */

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number; // ms remaining
  age: number; // ms lived
  alpha: number; // 0..1
};

/* --------------------------------- core ----------------------------------- */

export const drawParticleToCanvas: DrawParticleToCanvas = (
  surface: CanvasLike,
  path: EngineStrokePath | Iterable<RenderPathPoint>,
  options: RenderOptions & { particle: ParticleOptions },
  _overrides?: RenderOverrides
) => {
  const ctx = getCtx(surface);
  const pts = toPoints(path);
  if (pts.length === 0) return;

  // Global composite / alpha controls from overrides
  const ov = options.engine.overrides ?? {};
  const composite: GlobalCompositeOperation =
    ((ov as Record<string, unknown>).composite as GlobalCompositeOperation) ??
    options.engine.rendering?.blendMode ??
    "source-over";
  const flow01 = clamp01(num(ov.flow, 100) / 100);
  const opacity01 = clamp01(num(ov.opacity, 100) / 100);

  ctx.save();
  ctx.globalCompositeOperation = composite;

  if (typeof options.color === "string") {
    // stampParticle reads a color; keep a default anyway
    ctx.fillStyle = options.color;
  }

  const rng = makeRng(num(options.seed, 0) | 0);

  // Resolve particle numbers (all concrete & clamped)
  const P = options.particle;
  const emitRate = Math.max(0, P.emitRatePerSec);
  const lifeMs = Math.max(1, P.lifeMs);
  const sizeMin = Math.max(0.5, P.sizeMinPx);
  const sizeMax = Math.max(sizeMin, P.sizeMaxPx);
  const spdMin = Math.max(0, P.speedMin);
  const spdMax = Math.max(spdMin, P.speedMax);
  const dragPerSec = clamp01(P.dragPerSec);
  const gravity = P.gravity;
  const angleSpread = Math.max(0, P.angleSpreadRad);
  const splatterProb = clamp01(P.splatterProb);
  const dripG = Math.max(0, P.dripGravity);
  const dripStretch = clamp01(P.dripStretch);
  const noiseAmt = clamp01(P.noiseAmount);
  const noiseScale = Math.max(1, P.noiseScalePx);

  const decal = P.decal?.kind ? P.decal : { kind: "round" as const };
  const antiHaloPx = Math.max(0, P.antiHaloPx);
  const antiHaloAlpha = clamp01(P.antiHaloAlpha);
  const inkMode = P.inkMode ?? "inner-grain";

  // Integrator state
  const particles: Particle[] = [];
  let carryEmit = 0;

  // add near other helpers
  function isFiniteNumber(v: unknown): v is number {
    return typeof v === "number" && Number.isFinite(v);
  }

  function normalizeDecal(
    d: ParticleOptions["decal"] | undefined
  ):
    | { kind: "round" }
    | { kind: "sprite"; image: CanvasImageSource; sizeScale?: number } {
    if (!d || d.kind !== "sprite") return { kind: "round" };
    // Only include sizeScale when it's a concrete number (do NOT pass undefined)
    return isFiniteNumber(d.sizeScale)
      ? { kind: "sprite", image: d.image, sizeScale: d.sizeScale }
      : { kind: "sprite", image: d.image };
  }

  // Spawn a bundle of particles at (x,y), aimed around path tangent (dx,dy)
  function spawnAt(
    x: number,
    y: number,
    dx: number,
    dy: number,
    pressure: number,
    count: number
  ) {
    const len = hypot(dx, dy);
    const tx = len > 1e-6 ? dx / len : 1;
    const ty = len > 1e-6 ? dy / len : 0;

    for (let k = 0; k < count; k++) {
      // angle spread around tangent
      const a = (rng() * 2 - 1) * angleSpread;
      const sa = Math.sin(a),
        ca = Math.cos(a);
      const dirx = tx * ca - ty * sa;
      const diry = tx * sa + ty * ca;

      let spd = spdMin + (spdMax - spdMin) * rng();
      let size = sizeMin + (sizeMax - sizeMin) * rng();

      // splatter: faster & smaller
      if (rng() < splatterProb) {
        spd *= 1.35 + 0.4 * rng();
        size *= 0.8 + 0.6 * rng();
      }

      // light pressure scaling
      const pMul = 0.6 + 0.6 * clamp01(pressure);
      size *= pMul;
      spd *= 0.5 + 0.8 * clamp01(pressure);

      particles.push({
        x,
        y,
        vx: dirx * spd,
        vy: diry * spd,
        size,
        life: lifeMs,
        age: 0,
        alpha: 1,
      });
    }
  }

  // Safe dt (ms) between samples; synthesize ~16ms if timestamps missing
  const dtAt = (i: number): number => {
    const a = must(pts[i - 1], `pts[${i - 1}]`);
    const b = must(pts[i], `pts[${i}]`);
    return typeof a.t === "number" && typeof b.t === "number"
      ? Math.max(1, b.t - a.t)
      : 16;
  };

  // Emit & integrate along the path
  for (let i = 1; i < pts.length; i++) {
    const a = must(pts[i - 1], `pts[${i - 1}]`);
    const b = must(pts[i], `pts[${i}]`);

    const dtMs = dtAt(i);
    const dt = dtMs / 1000;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = hypot(dx, dy);
    const speed = dist / Math.max(dt, 1e-6); // px/s
    const pNow = pressure01(b);

    // Expected particles this segment
    const rate = emitRate * (0.5 + 0.5 * pNow);
    const want = rate * dt * (0.3 + 0.7 * clamp01(speed / (spdMax + 1e-3)));
    const toEmit = carryEmit + want;
    const whole = Math.floor(toEmit);
    carryEmit = toEmit - whole;

    if (whole > 0) spawnAt(b.x, b.y, dx, dy, pNow, whole);

    // Integrate all particles for this interval
    const drag = 1 - (1 - dragPerSec) * dt; // convert per-second→per-dt

    for (let pi = particles.length - 1; pi >= 0; pi--) {
      const it = particles[pi];
      if (!it) continue;

      // Physics + drip bias
      const extraG = it.vy > 0 ? dripG : 0;
      it.vx *= 1 - drag;
      it.vy = it.vy * (1 - drag) + (gravity + extraG) * dt;

      it.x += it.vx * dt;
      it.y += it.vy * dt;

      it.age += dtMs;
      it.life -= dtMs;

      if (it.life <= 0) {
        particles.splice(pi, 1);
        continue;
      }

      // Lifetime fade
      const lifeT = clamp01(1 - it.age / (lifeMs + 1e-6));
      let particleAlpha = lifeT;

      // Rim vs inner-grain noise modulation
      if (noiseAmt > 0) {
        const n = noise2(rng, it.x / noiseScale, it.y / noiseScale); // 0..1
        particleAlpha *=
          inkMode === "inner-grain"
            ? 1 - noiseAmt + noiseAmt * (0.8 + 0.2 * n)
            : 1 - noiseAmt + noiseAmt * (0.9 + 0.3 * n);
      }

      // Drip stretch (elongate when falling)
      const speedNow = hypot(it.vx, it.vy);
      const stretch =
        dripStretch > 0 && it.vy > 0
          ? 1 + dripStretch * clamp01(speedNow / (spdMax + 1e-3))
          : 1;
      const sizeNow = Math.max(0.5, it.size * stretch);

      // Combine with global flow/opacity
      const finalAlpha = clamp01(particleAlpha * flow01 * opacity01);

      const solidColor: string =
        typeof options.color === "string" ? options.color : "#000000";

      stampParticle(ctx, {
        x: it.x,
        y: it.y,
        size: sizeNow,
        alpha: finalAlpha,
        color: solidColor,
        decal: normalizeDecal(decal),
        antiHaloPx,
        antiHaloAlpha,
        inkMode,
      });
    }
  }

  ctx.restore();
};
