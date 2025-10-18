// FILE: src/lib/brush/backends/smudge/variants/soft.ts
import type { RenderOptions, RenderOverrides } from "@/lib/brush/engine.types";
import type { Ctx2D, CanvasLike } from "@backends/utils/canvas";
import { createLayer, get2D } from "@backends/utils/canvas";
import { makeStamps, clamp01 } from "./_common";
import { dragStamp } from "../core/drag";
import { applyDissolve } from "../core/dissolve";
import { sampleCurve } from "@/lib/brush/curves";

/** Gentle smear + slight mixing vibe. */
export function drawSmudgeSoft(ctx: Ctx2D, opt: RenderOptions): void {
  const stamps = makeStamps(
    opt,
    (opt.engine.backendOverrides?.smudge as { spacing?: number } | undefined)
      ?.spacing
  );
  if (stamps.length < 2) return;

  const ov = (opt.engine.overrides ?? {}) as Partial<RenderOverrides>;

  // --- Composite (global) ----------------------------------------------------
  const composite =
    (ov as any).composite ??
    opt.engine.rendering?.blendMode ??
    ("source-over" as GlobalCompositeOperation);
  (ctx as CanvasRenderingContext2D).globalCompositeOperation = composite;

  // --- Curves & globals ------------------------------------------------------
  const flow01 = clamp01(((ov.flow ?? 85) as number) / 100);

  const pressureToFlowCurve = (ov as any).pressureToFlowCurve as
    | number[]
    | undefined;
  const speedToFlowCurve = (ov as any).speedToFlowCurve as number[] | undefined;
  const speedRef =
    (ov as any).speedNormRefPxPerSec &&
    Number.isFinite((ov as any).speedNormRefPxPerSec)
      ? (ov as any).speedNormRefPxPerSec
      : 1000;

  // Optional: shape radius (width) by pressure using a LUT
  const pressureToWidthCurve = (ov as any).pressureToWidthCurve as
    | number[]
    | undefined;

  // --- Variant-local knobs ---------------------------------------------------
  const o = (opt.engine.backendOverrides?.smudge ?? {}) as Partial<{
    strength: number;
    alphaMul: number;
    radiusGain: number;
    softenPx: number;
    falloff: "gaussian" | "cosine";
    alignWithTangent: number;
    anisotropy: number;
    maxOffsetPx: number;
    dissolve: boolean;
    dissolveAmount: number;
    dissolveScale: number;
  }>;

  const alphaMulGlobal = (o.alphaMul ?? 0.9) * flow01;
  const rGain = Math.max(0.2, o.radiusGain ?? 0.9);
  const softenPx = Math.max(0, o.softenPx ?? 0.8);
  const falloff = o.falloff ?? "gaussian";
  const align = clamp01(o.alignWithTangent ?? 0.6);
  const anis = clamp01(o.anisotropy ?? 0.35);
  const maxOffset = Math.max(0, o.maxOffsetPx ?? 18);
  const strength = clamp01(o.strength ?? 0.6);

  // Snapshot underlayer once (source for smearing)
  const srcW = (ctx.canvas as HTMLCanvasElement | OffscreenCanvas).width;
  const srcH = (ctx.canvas as HTMLCanvasElement | OffscreenCanvas).height;
  const src: CanvasLike = createLayer(srcW, srcH);
  get2D(src).drawImage(ctx.canvas as CanvasImageSource, 0, 0);

  // Temp layer to accumulate smears, then draw once (keeps source stable)
  const tmp: CanvasLike = createLayer(srcW, srcH);
  const dx = get2D(tmp);

  // Helpers
  const clampLen = (v: number, maxAbs: number) => {
    const m = Math.abs(v);
    return m > maxAbs ? (v < 0 ? -maxAbs : maxAbs) : v;
  };

  // Walk stamps; smear into tmp
  let prev = stamps[0]!;
  for (let i = 1; i < stamps.length; i++) {
    const s = stamps[i]!;
    const baseR = Math.max(0.75, (opt.baseSizePx ?? 12) * rGain * s.widthScale);

    // Pressure and width shaping
    const pMid = clamp01((s.pressure + prev.pressure) * 0.5);
    const widthScale = pressureToWidthCurve
      ? sampleCurve(pressureToWidthCurve, pMid)
      : 0.6 + 0.6 * Math.pow(pMid, 0.85); // previous behavior
    const radius = baseR * widthScale * (1 + anis * 0.0); // (anis reserved)

    // Offsets: blend between raw delta and tangent projection
    const dxRaw = s.x - prev.x;
    const dyRaw = s.y - prev.y;
    const along = (s.tangentDeg * Math.PI) / 180;
    const ax = Math.cos(along),
      ay = Math.sin(along);
    const proj = dxRaw * ax + dyRaw * ay;
    const offX = clampLen(
      -(dxRaw * (1 - align) + ax * proj * align) * strength,
      maxOffset
    );
    const offY = clampLen(
      -(dyRaw * (1 - align) + ay * proj * align) * strength,
      maxOffset
    );

    // --- Alpha curves (pressure + speed) ------------------------------------
    const distPx = Math.hypot(dxRaw, dyRaw);
    // We don’t have timestamps here; assume ~60Hz for a reasonable proxy.
    const dtSec = 1 / 60;
    const speedPxPerSec = distPx / dtSec;
    const pMul = pressureToFlowCurve
      ? sampleCurve(pressureToFlowCurve, pMid)
      : 1;
    const vMul = speedToFlowCurve
      ? sampleCurve(
          speedToFlowCurve,
          clamp01(speedPxPerSec / Math.max(1, speedRef))
        )
      : 1;

    const alpha = alphaMulGlobal * pMul * vMul * (0.6 + 0.4 * pMid);

    dragStamp(dx, src, s.x, s.y, radius, offX, offY, {
      alpha,
      softenPx,
      falloff,
      anisotropy: anis,
      alignWithTangent: align,
      tangentDeg: s.tangentDeg,
    });

    prev = s;
  }

  // Optional dissolve
  if ((o.dissolve ?? false) && (o.dissolveAmount ?? 0) > 0) {
    applyDissolve(
      tmp,
      Math.max(0, Math.min(1, o.dissolveAmount ?? 0.25)),
      Math.max(4, o.dissolveScale ?? 12)
    );
  }

  // Composite tmp over dest
  (ctx as CanvasRenderingContext2D).globalCompositeOperation = "source-over";
  ctx.drawImage(tmp, 0, 0);
}
