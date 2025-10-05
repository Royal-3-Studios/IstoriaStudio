import type { RenderOptions, RenderOverrides } from "@/lib/brush/engine";
import type { Ctx2D, CanvasLike } from "@backends/utils/canvas";
import { createLayer, get2D } from "@backends/utils/canvas";
import { makeStamps, clamp01 } from "./_common";
import { dragStamp } from "../core/drag";
import { applyDissolve } from "../core/dissolve";

/** High-anisotropy smear aligned with tangent (palette-knife streak). */
export function drawSmudgeStreak(ctx: Ctx2D, opt: RenderOptions): void {
  const stamps = makeStamps(
    opt,
    (opt.engine.backendOverrides?.smudge as { spacing?: number } | undefined)
      ?.spacing
  );
  if (stamps.length < 2) return;

  const ov = (opt.engine.overrides ?? {}) as Partial<RenderOverrides>;
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

  const flow01 = clamp01(((ov.flow ?? 90) as number) / 100);
  const alphaMul = (o.alphaMul ?? 0.9) * flow01;
  const rGain = Math.max(0.2, o.radiusGain ?? 1.0);
  const softenPx = Math.max(0, o.softenPx ?? 0.6);
  const falloff = o.falloff ?? "cosine";
  const align = 1; // fully align to tangent for streaks
  const anis = 1; // strongest directionality
  const maxOffset = Math.max(8, o.maxOffsetPx ?? 28);

  const srcW = (ctx.canvas as HTMLCanvasElement | OffscreenCanvas).width;
  const srcH = (ctx.canvas as HTMLCanvasElement | OffscreenCanvas).height;
  const src: CanvasLike = createLayer(srcW, srcH);
  get2D(src).drawImage(ctx.canvas as CanvasImageSource, 0, 0);

  const tmp: CanvasLike = createLayer(srcW, srcH);
  const dx = get2D(tmp);

  let px = stamps[0]!;
  for (let i = 1; i < stamps.length; i++) {
    const s = stamps[i]!;
    const baseR = Math.max(0.75, (opt.baseSizePx ?? 12) * rGain * s.widthScale);
    const pMid = (s.pressure + px.pressure) * 0.5;

    const dxRaw = s.x - px.x;
    const dyRaw = s.y - px.y;
    const along = (s.tangentDeg * Math.PI) / 180;
    const ax = Math.cos(along),
      ay = Math.sin(along);
    const proj = dxRaw * ax + dyRaw * ay;

    const offX = clampLen(-(ax * proj) * (o.strength ?? 0.9), maxOffset);
    const offY = clampLen(-(ay * proj) * (o.strength ?? 0.9), maxOffset);

    const radius = baseR * (0.7 + 0.7 * Math.pow(pMid, 0.9));
    const alpha = alphaMul * (0.65 + 0.35 * pMid);

    dragStamp(dx, src, s.x, s.y, radius, offX, offY, {
      alpha,
      softenPx,
      falloff,
      anisotropy: anis,
      alignWithTangent: align,
      tangentDeg: s.tangentDeg,
    });

    px = s;
  }

  if ((o.dissolve ?? false) && (o.dissolveAmount ?? 0) > 0) {
    applyDissolve(
      tmp,
      Math.max(0, Math.min(1, o.dissolveAmount ?? 0.3)),
      Math.max(4, o.dissolveScale ?? 10)
    );
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(tmp, 0, 0);
}

function clampLen(v: number, maxAbs: number): number {
  const m = Math.abs(v);
  return m > maxAbs ? (v < 0 ? -maxAbs : maxAbs) : v;
}
