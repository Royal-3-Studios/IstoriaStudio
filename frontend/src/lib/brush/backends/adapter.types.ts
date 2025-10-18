// FILE: src/lib/brush/backends/adapter.types.ts
import type { CanvasLike } from "@backends/utils/canvas";
import type { BrushContext } from "@/lib/brush/core/brushContext";
import type {
  NormalizedRenderOptions,
  RenderPathPoint,
  BrushInputSample,
} from "@/lib/brush/engine.types";
import type { BackendCaps } from "./caps";

/* -------------------------------------------------------------------------- */
/*                               Adapter Interface                            */
/* -------------------------------------------------------------------------- */

/**
 * Unified adapter surface used by the engine + registry.
 * All backends (stamping, ribbon, spray, etc.) implement this shape.
 */
export type BackendAdapter = {
  /** Unique backend identifier (e.g. "stamping", "ribbon", "smudge", etc.) */
  id: string;

  /** Optional declared capabilities for UI or feature gating. */
  caps?: Readonly<BackendCaps>;

  /** Draws a stroke into the given surface (already sized by the engine). */
  drawToCanvas(
    surface: CanvasLike,
    opt: NormalizedRenderOptions & { brushCtx: BrushContext }
  ): void | Promise<void>;
};

/* -------------------------------------------------------------------------- */
/*                               Input Sampling                               */
/* -------------------------------------------------------------------------- */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Build a BrushInputSample from two path points (omit undefined fields). */
export function toInputSample(
  opt: NormalizedRenderOptions & { brushCtx: BrushContext },
  curr: RenderPathPoint,
  prev?: RenderPathPoint
): BrushInputSample {
  // pressure (prefer `p`, fallback to `pressure`, then default to 1)
  const pressure =
    typeof (curr as { p?: number }).p === "number"
      ? (curr as { p?: number }).p!
      : typeof curr.pressure === "number"
        ? curr.pressure
        : 1;

  // instantaneous speed (px/s) from timestamps if available
  const dx = prev ? curr.x - prev.x : 0;
  const dy = prev ? curr.y - prev.y : 0;
  const dist = Math.hypot(dx, dy);
  const dtMs =
    prev && typeof prev.t === "number" && typeof curr.t === "number"
      ? Math.max(1, curr.t - prev.t)
      : 16;
  const speed = dist / (dtMs / 1000);

  const speedRef =
    (opt.engine.overrides?.speedNormRefPxPerSec as number | undefined) ?? 1000;
  const speedNorm = clamp01(speed / Math.max(1, speedRef));

  // Construct sparsely — never assign undefined fields
  const out: BrushInputSample = { pressure, speedNorm };

  if (typeof curr.tilt === "number" && Number.isFinite(curr.tilt)) {
    out.tiltShading = clamp01(curr.tilt);
  }

  const az = (curr as unknown as { azimuthRad?: number }).azimuthRad;
  if (typeof az === "number" && Number.isFinite(az)) {
    out.azimuthRad = az;
  }

  // Example extension if altitudeDeg is computed upstream:
  // if (typeof curr.altitudeDeg === "number") out.altitudeDeg = curr.altitudeDeg;

  return out;
}
