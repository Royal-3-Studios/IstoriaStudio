import type { RenderOptions, RenderOverrides } from "@/lib/brush/engine";
import type { Ctx2D, CanvasLike } from "@backends/utils/canvas";
import { createLayer, get2D } from "@backends/utils/canvas";
import { makeStamps, clamp01 } from "./_common";
import { PaintBuffer, mixerStamp } from "../core/mixer";
import { applyDissolve } from "../core/dissolve";

/** Wet mixer: picks up under-color and lays it down along the path. */
export function drawSmudgeOily(ctx: Ctx2D, opt: RenderOptions): void {
  const stamps = makeStamps(
    opt,
    (opt.engine.backendOverrides?.smudge as { spacing?: number } | undefined)
      ?.spacing
  );
  if (stamps.length < 2) return;

  const ov = (opt.engine.overrides ?? {}) as Partial<RenderOverrides>;
  const o = (opt.engine.backendOverrides?.smudge ?? {}) as Partial<{
    pickup: number;
    laydown: number;
    alphaMul: number;
    radiusGain: number;
    mixFalloff: "gaussian" | "cosine";
    dissolve: boolean;
    dissolveAmount: number;
    dissolveScale: number;
  }>;

  const flow01 = clamp01(((ov.flow ?? 100) as number) / 100);
  const pickup = Math.max(0, Math.min(1, o.pickup ?? 0.55));
  const laydown = Math.max(0, Math.min(1, o.laydown ?? 0.8));
  const alphaMul = (o.alphaMul ?? 1.0) * flow01;
  const rGain = Math.max(0.2, o.radiusGain ?? 0.95);
  const falloff = o.mixFalloff ?? "gaussian";

  const srcW = (ctx.canvas as HTMLCanvasElement | OffscreenCanvas).width;
  const srcH = (ctx.canvas as HTMLCanvasElement | OffscreenCanvas).height;
  const src: CanvasLike = createLayer(srcW, srcH);
  get2D(src).drawImage(ctx.canvas as CanvasImageSource, 0, 0);

  const tmp: CanvasLike = createLayer(srcW, srcH);
  const dx = get2D(tmp);
  const buf = new PaintBuffer();

  for (let i = 0; i < stamps.length; i++) {
    const s = stamps[i]!;
    const baseR = Math.max(0.75, (opt.baseSizePx ?? 12) * rGain * s.widthScale);
    const alpha = alphaMul * (0.55 + 0.45 * s.pressure);
    mixerStamp(dx, src, buf, s.x, s.y, baseR, {
      pickup,
      laydown,
      alpha,
      falloff,
    });
  }

  if ((o.dissolve ?? false) && (o.dissolveAmount ?? 0) > 0) {
    applyDissolve(
      tmp,
      Math.max(0, Math.min(1, o.dissolveAmount ?? 0.25)),
      Math.max(4, o.dissolveScale ?? 12)
    );
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(tmp, 0, 0);
}
