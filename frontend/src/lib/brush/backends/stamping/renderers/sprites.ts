// FILE: src/lib/brush/backends/stamping/renderers/sprites.ts
export type SpriteSource = CanvasImageSource;
/** Placeholder for sprite-based stamping pipelines (e.g., textured leaves). */
export function drawSprite(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  sprite: SpriteSource,
  x: number,
  y: number,
  angleRad: number,
  scale: number
): void {
  const w = (sprite as HTMLCanvasElement | OffscreenCanvas).width ?? 1;
  const h = (sprite as HTMLCanvasElement | OffscreenCanvas).height ?? 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angleRad);
  ctx.scale(scale, scale);
  ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
  ctx.restore();
}
