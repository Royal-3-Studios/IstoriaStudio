// FILE: src/lib/brush/backends/particle/core/stamp.ts

type Ctx = CanvasRenderingContext2D;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export type StampOpts = {
  x: number;
  y: number;
  size: number;
  alpha: number; // 0..1
  color?: string; // fill color
  decal?:
    | { kind: "round" }
    | { kind: "sprite"; image: CanvasImageSource; sizeScale?: number };
  antiHaloPx: number; // ring width outside stamp
  antiHaloAlpha: number; // 0..1
  inkMode: "rim" | "inner-grain";
};

/** Optional anti-halo ring (destination-out just outside the stamp). */
function antiHaloCarve(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  widthPx: number,
  alpha: number
) {
  if (!(widthPx > 0) || !(alpha > 0)) return;
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.globalAlpha = clamp01(alpha);
  ctx.beginPath();
  ctx.arc(x, y, r + widthPx, 0, Math.PI * 2);
  ctx.arc(x, y, r, 0, Math.PI * 2, true); // punch inner
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Rim/inner-grain look via composite choice and a tiny opacity tweak. */
function applyInkComposite(ctx: Ctx, mode: "rim" | "inner-grain") {
  // "rim" → glassy ink: brighten edges when layered
  // "inner-grain" → toothy: let paper grain darken overlaps
  ctx.globalCompositeOperation = mode === "rim" ? "screen" : "multiply";
}

/** Stamp either round disk or sprite decal with alpha and quality passes. */
export function stampParticle(ctx: Ctx, opt: StampOpts) {
  const size = Math.max(0.5, opt.size);
  const r = size * 0.5;
  const alpha = clamp01(opt.alpha);

  // 1) Anti-halo carve just outside the footprint (before drawing ink).
  antiHaloCarve(
    ctx,
    opt.x,
    opt.y,
    r,
    Math.max(0, opt.antiHaloPx),
    Math.max(0, opt.antiHaloAlpha)
  );

  // 2) Ink composite & draw
  ctx.save();
  applyInkComposite(ctx, opt.inkMode);
  ctx.globalAlpha = alpha;

  if (!opt.decal || opt.decal.kind === "round") {
    if (opt.color) ctx.fillStyle = opt.color;
    ctx.beginPath();
    ctx.arc(opt.x, opt.y, r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // sprite decal
    const scale =
      typeof opt.decal.sizeScale === "number" && isFinite(opt.decal.sizeScale)
        ? opt.decal.sizeScale
        : 1;
    const w = size * scale;
    const h = w;
    ctx.drawImage(opt.decal.image, opt.x - w * 0.5, opt.y - h * 0.5, w, h);
  }

  ctx.restore();
}
