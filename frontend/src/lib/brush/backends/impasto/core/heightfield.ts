// FILE: src/lib/brush/backends/impasto/core/heightfield.ts
import type { Ctx2D, CanvasLike } from "@/lib/canvas/context";
import { createLayer, get2DContext } from "@/lib/canvas/context";

export type HeightStamp = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  radius: number; // px
  alpha: number; // 0..1
  color: string; // stroke color
};

/**
 * Draws height "strokes" into a single layer, where alpha encodes height.
 * Returns a CanvasLike (HTMLCanvasElement or OffscreenCanvas).
 */
export function drawHeightStamps(
  width: number,
  height: number,
  stamps: ReadonlyArray<HeightStamp>
): CanvasLike {
  const layer = createLayer(width, height);
  const ctx: Ctx2D = get2DContext(layer, { alpha: true });

  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const s of stamps) {
    const alpha = Math.max(0, Math.min(1, s.alpha));
    ctx.globalAlpha = alpha;
    (ctx as unknown as { strokeStyle: string }).strokeStyle = s.color;
    (ctx as unknown as { lineWidth: number }).lineWidth = Math.max(
      0.5,
      2 * Math.max(0, s.radius)
    );
    ctx.beginPath();
    ctx.moveTo(s.ax, s.ay);
    ctx.lineTo(s.bx, s.by);
    ctx.stroke();
  }
  return layer;
}

/**
 * Fast blur using CSS filter if supported (applies in place).
 * No-op if filters are unavailable or radius is tiny.
 */
export function blurLayerInPlace(layer: CanvasLike, radiusPx: number): void {
  if (radiusPx <= 0.01) return;
  const ctx: Ctx2D = get2DContext(layer, { alpha: true });

  // Feature-detect CSS filter support on the 2D context
  const maybeFilter = ctx as unknown as { filter?: string };
  if (typeof maybeFilter.filter === "string") {
    maybeFilter.filter = `blur(${radiusPx.toFixed(3)}px)`;
    ctx.drawImage(layer as unknown as CanvasImageSource, 0, 0);
    maybeFilter.filter = "none";
  }
}
