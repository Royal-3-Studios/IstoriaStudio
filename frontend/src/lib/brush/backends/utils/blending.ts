import type { BlendMode } from "@/lib/brush/core/types";

/** Union for both HTML and Offscreen 2D contexts */
export type Ctx2D =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

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
export function toCompositeOp(
  mode: BlendMode | GlobalCompositeOperation
): GlobalCompositeOperation {
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

/**
 * Set composite mode with graceful fallback to "source-over".
 * Returns a **pop** function that restores the previous value.
 */
export function pushComposite(
  ctx: Ctx2D,
  mode: BlendMode | GlobalCompositeOperation
): () => void {
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

/**
 * Convenience: run a drawing block under a temporary composite mode,
 * then restore the previous mode even if the callback throws.
 */
export function withComposite<T>(
  ctx: Ctx2D,
  mode: BlendMode | GlobalCompositeOperation,
  draw: () => T
): T {
  const pop = pushComposite(ctx, mode);
  try {
    return draw();
  } finally {
    pop();
  }
}

/** Push/with helpers for alpha — matches composite ergonomics. */
export function pushAlpha(ctx: Ctx2D, alpha: number): () => void {
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  return () => {
    ctx.globalAlpha = prev;
  };
}

export function withAlpha<T>(ctx: Ctx2D, alpha: number, draw: () => T): T {
  const pop = pushAlpha(ctx, alpha);
  try {
    return draw();
  } finally {
    pop();
  }
}

/** Combined helper: set (composite, alpha), run, restore both. */
export function withCompositeAndAlpha<T>(
  ctx: Ctx2D,
  mode: BlendMode | GlobalCompositeOperation,
  alpha: number,
  draw: () => T
): T {
  const popBlend = pushComposite(ctx, mode);
  const popAlpha = pushAlpha(ctx, alpha);
  try {
    return draw();
  } finally {
    popAlpha();
    popBlend();
  }
}
