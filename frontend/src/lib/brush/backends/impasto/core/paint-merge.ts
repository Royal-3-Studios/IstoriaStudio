// FILE: src/lib/brush/backends/impasto/core/paint-merge.ts
import type { Ctx2D, CanvasLike } from "@/lib/canvas/context";
import { createLayer, get2DContext } from "@/lib/canvas/context";
import * as Blend from "@backends/utils/blending";

/**
 * Create a pigment layer (filled with `color`) clipped by the height alpha.
 */
export function pigmentFrom(height: CanvasLike, color: string): CanvasLike {
  const w = (height as HTMLCanvasElement | OffscreenCanvas).width ?? 0;
  const h = (height as HTMLCanvasElement | OffscreenCanvas).height ?? 0;

  const pigment = createLayer(w, h);
  const px: Ctx2D = get2DContext(pigment, { alpha: true });

  // Fill with color…
  (px as unknown as { fillStyle: string }).fillStyle = color;
  px.fillRect(0, 0, w, h);

  // …then clip to height (alpha)
  Blend.withComposite(px, "destination-in", () => {
    px.drawImage(height as unknown as CanvasImageSource, 0, 0);
  });

  return pigment;
}

/** Multiply shading onto pigment. */
export function applyShading(pigment: CanvasLike, shade: CanvasLike): void {
  const ctx: Ctx2D = get2DContext(pigment, { alpha: true });
  Blend.withComposite(ctx, "multiply", () => {
    ctx.drawImage(shade as unknown as CanvasImageSource, 0, 0);
  });
}

/**
 * Optional light/spec pass (screen).
 * - `amount01`: overall spec intensity [0..1]
 * - `fromShadeAlpha01`: scale the shade contribution [0..1]
 */
export function applySpecular(
  target: CanvasLike,
  source: CanvasLike,
  amount01: number,
  fromShadeAlpha01 = 1
): void {
  const amt = Math.max(0, Math.min(1, amount01));
  if (amt <= 0.001) return;

  const w = (target as HTMLCanvasElement | OffscreenCanvas).width ?? 0;
  const h = (target as HTMLCanvasElement | OffscreenCanvas).height ?? 0;

  const tmp = createLayer(w, h);
  const tx: Ctx2D = get2DContext(tmp, { alpha: true });

  tx.globalAlpha = amt;

  const srcAlpha = Math.max(0, Math.min(1, fromShadeAlpha01));
  if (srcAlpha < 1) {
    Blend.withCompositeAndAlpha(tx, "source-over", srcAlpha, () => {
      tx.drawImage(source as unknown as CanvasImageSource, 0, 0);
    });
  } else {
    tx.drawImage(source as unknown as CanvasImageSource, 0, 0);
  }

  const ctx: Ctx2D = get2DContext(target, { alpha: true });
  Blend.withComposite(ctx, "screen", () => {
    ctx.drawImage(tmp as unknown as CanvasImageSource, 0, 0);
  });
}
