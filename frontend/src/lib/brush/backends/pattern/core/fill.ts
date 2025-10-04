// FILE: src/lib/brush/backends/pattern/core/fill.ts

import type { Ctx2D } from "../utils/canvas";

/** Clip to a Path2D, run body, and always restore. */
export function withClip(ctx: Ctx2D, path: Path2D, body: () => void): void {
  ctx.save();
  try {
    ctx.clip(path);
    body();
  } finally {
    ctx.restore();
  }
}

/** Run `body` with a composite mode and alpha, then restore. */
export function withCompositeAndAlpha(
  ctx: Ctx2D,
  mode: GlobalCompositeOperation,
  alpha: number,
  body: () => void
): void {
  ctx.save();
  try {
    ctx.globalCompositeOperation = mode;
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    body();
  } finally {
    ctx.restore();
  }
}

/** (Optional) If you often need only alpha control. */
export function withAlpha(ctx: Ctx2D, alpha: number, body: () => void): void {
  ctx.save();
  try {
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    body();
  } finally {
    ctx.restore();
  }
}
