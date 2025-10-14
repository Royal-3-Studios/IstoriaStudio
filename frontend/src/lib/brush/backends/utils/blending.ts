// FILE: src/lib/brush/backends/utils/blending.ts
import type { BlendMode } from "@/lib/brush/core/types";

/** Union for both HTML and Offscreen 2D contexts */
export type Ctx2D =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export type CompositeLike = BlendMode | GlobalCompositeOperation;

export type CompositeAlphaOpts = {
  /** Canvas/global composite or your richer BlendMode enum */
  blend?: CompositeLike;
  /** 0..1; clamped */
  opacity?: number;
};

/** Map your rich BlendMode enum to Canvas composite ops (with approximations). */
const BLEND_TO_COMPOSITE: Partial<Record<BlendMode, GlobalCompositeOperation>> =
  {
    normal: "source-over",
    multiply: "multiply",
    screen: "screen",
    overlay: "overlay",
    "soft-light": "soft-light",
    "hard-light": "hard-light",
    "color-dodge": "color-dodge",
    "color-burn": "color-burn",
    darken: "darken",
    lighten: "lighten",
    difference: "difference",
    exclusion: "exclusion",
    hue: "hue",
    saturation: "saturation",
    color: "color",
    luminosity: "luminosity",

    // Approximations for modes Canvas doesn't expose directly:
    "linear-dodge": "lighter",
    "linear-burn": "darken",
    "vivid-light": "hard-light",
    "linear-light": "hard-light",
    "pin-light": "lighten",
    "hard-mix": "difference",
    "darker-color": "darken",
    "lighter-color": "lighten",
    subtract: "difference",
    divide: "screen",
    behind: "destination-over",
    clear: "destination-out",
  };

/** Convert a BlendMode (or raw composite string) to a Canvas composite op. */
export function toCompositeOp(mode: CompositeLike): GlobalCompositeOperation {
  return (
    (BLEND_TO_COMPOSITE as Record<string, GlobalCompositeOperation>)[
      mode as string
    ] ?? (mode as GlobalCompositeOperation)
  );
}

/** Probe if a composite op is supported on this context by set-and-verify (restores previous state). */
export function isCompositeSupported(
  ctx: Ctx2D,
  op: GlobalCompositeOperation
): boolean {
  const prev = ctx.globalCompositeOperation;
  let ok = true;
  try {
    ctx.globalCompositeOperation = op;
    ok = ctx.globalCompositeOperation === op;
  } catch {
    ok = false;
  } finally {
    try {
      ctx.globalCompositeOperation = prev;
    } catch {
      /* ignore */
    }
  }
  return ok;
}

/** Clamp helper for alpha. */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Set composite mode with graceful fallback to "source-over".
 * Returns a **pop** function that restores the previous value.
 */
export function pushComposite(ctx: Ctx2D, mode: CompositeLike): () => void {
  const prev = ctx.globalCompositeOperation;
  const desired = toCompositeOp(mode);
  try {
    ctx.globalCompositeOperation = desired;
    if (ctx.globalCompositeOperation !== desired) {
      ctx.globalCompositeOperation = "source-over";
    }
  } catch {
    ctx.globalCompositeOperation = "source-over";
  }
  return () => {
    try {
      ctx.globalCompositeOperation = prev;
    } catch {
      /* ignore */
    }
  };
}

/** Push/with helpers for alpha — matches composite ergonomics. */
export function pushAlpha(ctx: Ctx2D, alpha: number): () => void {
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = clamp01(Number.isFinite(alpha) ? alpha : 1);
  return () => {
    ctx.globalAlpha = prev;
  };
}

export function withComposite<T>(
  ctx: Ctx2D,
  mode: CompositeLike,
  draw: () => T
): T {
  const pop = pushComposite(ctx, mode);
  try {
    return draw();
  } finally {
    pop();
  }
}

export function withAlpha<T>(ctx: Ctx2D, alpha: number, draw: () => T): T {
  const pop = pushAlpha(ctx, alpha);
  try {
    return draw();
  } finally {
    pop();
  }
}

/**
 * Combined helper: set (composite, alpha), run, restore both.
 * Overloads support either (mode, alpha, fn) or ({blend, opacity}, fn).
 */
export function withCompositeAndAlpha<T>(
  ctx: Ctx2D,
  mode: CompositeLike,
  alpha: number,
  draw: () => T
): T;
export function withCompositeAndAlpha<T>(
  ctx: Ctx2D,
  opts: CompositeAlphaOpts,
  draw: () => T
): T;
export function withCompositeAndAlpha<T>(
  ctx: Ctx2D,
  a: CompositeLike | CompositeAlphaOpts,
  b: number | (() => T),
  c?: () => T
): T {
  // Normalize inputs
  let mode: CompositeLike = "source-over";
  let alpha = 1;
  let draw: () => T;

  if (typeof a === "object" && typeof b === "function") {
    mode = a.blend ?? "source-over";
    alpha = a.opacity ?? 1;
    draw = b;
  } else {
    mode = a as CompositeLike;
    alpha = (b as number) ?? 1;
    draw = c as () => T;
  }

  const popBlend = pushComposite(ctx, mode);
  const popAlpha = pushAlpha(ctx, alpha);
  try {
    return draw();
  } finally {
    popAlpha();
    popBlend();
  }
}

/** Optional: object-style export for call sites that use `Blend.withComposite(...)`. */
export const Blend = {
  toCompositeOp,
  isCompositeSupported,
  pushComposite,
  withComposite,
  pushAlpha,
  withAlpha,
  withCompositeAndAlpha,
};
