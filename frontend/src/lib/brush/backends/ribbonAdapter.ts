// FILE: src/lib/brush/backends/ribbonAdapter.ts
import type { BackendAdapter } from "./adapter.types";
import type {
  NormalizedRenderOptions,
  RenderPathPoint,
} from "@/lib/brush/engine.types";
import type { CanvasLike } from "@backends/utils/canvas";
import drawRibbonToCanvas from "./ribbon/core/ribbon";

/**
 * Ribbon adapter (slim)
 * - Forwards normalized options + concrete strokePath to the ribbon core.
 * - Core handles spacing/streamline/curves; orchestrator already handled DPR.
 */
export const ribbonAdapter: BackendAdapter = {
  id: "ribbon",

  drawToCanvas(
    surface: CanvasLike,
    opt: NormalizedRenderOptions & { brushCtx: unknown }
  ) {
    const path = (opt.path ?? []) as ReadonlyArray<RenderPathPoint>;

    // Build a concrete strokePath (no undefineds) to satisfy exactOptionalPropertyTypes.
    const sp = opt.engine.strokePath ?? {};
    const strokePath = {
      spacing:
        typeof sp.spacing === "number" && Number.isFinite(sp.spacing)
          ? sp.spacing
          : 2,
      jitter:
        typeof sp.jitter === "number" && Number.isFinite(sp.jitter)
          ? sp.jitter
          : 0,
      streamline:
        typeof sp.streamline === "number" && Number.isFinite(sp.streamline)
          ? sp.streamline
          : 0,
      count:
        typeof sp.count === "number" && Number.isFinite(sp.count)
          ? sp.count
          : 1,
      // Optional fields with sensible defaults used by the core
      cap: "round" as CanvasLineCap,
      tip: { kind: "round" as const },
    };

    // Pass through everything else (color, engine.* overrides, etc.)
    const withStrokePath = {
      ...opt,
      strokePath,
    };

    drawRibbonToCanvas(surface, path, withStrokePath);
  },
};

export default ribbonAdapter;
