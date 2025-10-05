import type { RenderOptions, RenderOverrides } from "@/lib/brush/engine";
import type { Ctx2D, CanvasLike } from "@backends/utils/canvas";
import { createLayer, get2D } from "@backends/utils/canvas";
import { makeStamps, clamp01 } from "./_common";
import { dragStamp } from "../core/drag";
import { applyDissolve } from "../core/dissolve";

/** Gentle smear + slight mixing vibe. */
export function drawSmudgeSoft(ctx: Ctx2D, opt: RenderOptions): void {
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

  const flow01 = clamp01(((ov.flow ?? 85) as number) / 100);
  const alphaMul = (o.alphaMul ?? 0.9) * flow01;
  const rGain = Math.max(0.2, o.radiusGain ?? 0.9);
  const softenPx = Math.max(0, o.softenPx ?? 0.8);
  const falloff = o.falloff ?? "gaussian";
  const align = clamp01(o.alignWithTangent ?? 0.6);
  const anis = clamp01(o.anisotropy ?? 0.35);
  const maxOffset = Math.max(0, o.maxOffsetPx ?? 18);

  // snapshot underlayer once (source for smearing)
  const srcW = (ctx.canvas as HTMLCanvasElement | OffscreenCanvas).width;
  const srcH = (ctx.canvas as HTMLCanvasElement | OffscreenCanvas).height;
  const src: CanvasLike = createLayer(srcW, srcH);
  get2D(src).drawImage(ctx.canvas as CanvasImageSource, 0, 0);

  // temp layer to apply optional dissolve once at the end
  const tmp: CanvasLike = createLayer(srcW, srcH);
  const dx = get2D(tmp);

  // walk stamps; smear into tmp; draw tmp over ctx at the end (keeps source stable)
  let px = stamps[0]!;
  for (let i = 1; i < stamps.length; i++) {
    const s = stamps[i]!;
    const baseR = Math.max(0.75, (opt.baseSizePx ?? 12) * rGain * s.widthScale);
    const pMid = (s.pressure + px.pressure) * 0.5;

    // offset: partly along tangent, partly along delta
    const dxRaw = s.x - px.x;
    const dyRaw = s.y - px.y;
    const along = (s.tangentDeg * Math.PI) / 180;
    const ax = Math.cos(along),
      ay = Math.sin(along);
    const proj = dxRaw * ax + dyRaw * ay;
    const offX = clampLen(
      -(dxRaw * (1 - align) + ax * proj * align) * (o.strength ?? 0.6),
      maxOffset
    );
    const offY = clampLen(
      -(dyRaw * (1 - align) + ay * proj * align) * (o.strength ?? 0.6),
      maxOffset
    );

    const radius =
      baseR * (0.6 + 0.6 * Math.pow(pMid, 0.85)) * (1 + anis * 0.0); // (anis reserved for future ellipse)
    const alpha = alphaMul * (0.6 + 0.4 * pMid);

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

  // optional dissolve
  if ((o.dissolve ?? false) && (o.dissolveAmount ?? 0) > 0) {
    applyDissolve(
      tmp,
      Math.max(0, Math.min(1, o.dissolveAmount ?? 0.25)),
      Math.max(4, o.dissolveScale ?? 12)
    );
  }

  // composite tmp over dest
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(tmp, 0, 0);
}

function clampLen(v: number, maxAbs: number): number {
  const m = Math.abs(v);
  return m > maxAbs ? (v < 0 ? -maxAbs : maxAbs) : v;
}
