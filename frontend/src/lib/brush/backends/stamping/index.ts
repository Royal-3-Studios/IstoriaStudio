// FILE: src/lib/brush/backends/stamping/index.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import { type Ctx2D, type CanvasLike, get2D } from "@backends/utils/canvas";

// Use DEFAULT exports for all variants (less brittle than named imports)

import drawInk from "./variants/ink";
import drawMarker from "./variants/marker";
import drawCalligraphy from "./variants/calligraphy";
import drawScatter from "./variants/scatter";
import drawSingle from "./variants/stamp";
import drawOrnament from "./variants/ornament";

// If you have tilt helpers, keep this (adjust path if needed)
import { getTiltOverrides } from "@backends/stamping/utils/scalars";
import drawGraphite from "./variants/graphite";

/** High-level stamping modes. */
export type StampingMode =
  | "graphite"
  | "ink"
  | "marker"
  | "calligraphy"
  | "scatter"
  | "stamp"
  | "ornament";

/** Backend-local overrides (attach via engine.backendOverrides.stamping). */
export type StampingOverrides = Partial<{
  mode: StampingMode;
  nibAngleDeg: number; // calligraphy-only
  tipMinPx: number; // clamp minimum width (px)
}>;

function isStampingMode(x: unknown): x is StampingMode {
  return (
    x === "graphite" ||
    x === "ink" ||
    x === "marker" ||
    x === "calligraphy" ||
    x === "scatter" ||
    x === "stamp" ||
    x === "ornament"
  );
}

/** Resolve the concrete stamping mode. Includes a temporary legacy shim. */
export function pickMode(opt: RenderOptions): StampingMode {
  const local = opt.engine.backendOverrides?.stamping as
    | StampingOverrides
    | undefined;

  if (isStampingMode(local?.mode)) return local.mode;

  // Legacy read-only shim: engine.overrides.stampingMode
  const legacy = opt.engine.overrides as { stampingMode?: unknown } | undefined;
  if (isStampingMode(legacy?.stampingMode)) return legacy.stampingMode;

  return "graphite";
}

/** Core entry: draw using the selected variant. */
export default function drawStamping(ctx: Ctx2D, opt: RenderOptions): void {
  // Normalize tilt knobs once and thread into overrides
  const tilt = getTiltOverrides?.(opt.engine.overrides) ?? {};
  const optWithTilt: RenderOptions = {
    ...opt,
    engine: {
      ...opt.engine,
      overrides: {
        ...(opt.engine.overrides ?? {}),
        ...tilt,
      },
    },
  };

  switch (pickMode(optWithTilt)) {
    case "ink":
      drawInk(ctx, optWithTilt);
      break;
    case "marker":
      drawMarker(ctx, optWithTilt);
      break;
    case "calligraphy":
      drawCalligraphy(ctx, optWithTilt);
      break;
    case "scatter":
      drawScatter(ctx, optWithTilt);
      break;
    case "stamp":
      drawSingle(ctx, optWithTilt);
      break;
    case "ornament":
      drawOrnament(ctx, optWithTilt);
      break;
    case "graphite":
    default:
      drawGraphite(ctx, optWithTilt);
      break;
  }
}

/** Convenience: accept a canvas surface, fetch a 2D context, then draw. */
export function drawToCanvas(surface: CanvasLike, opt: RenderOptions): void {
  const ctx = get2D(surface);
  drawStamping(ctx, opt);
}
