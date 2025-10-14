// FILE: src/lib/brush/backends/stamping/index.ts
import type { RenderOptions } from "@/lib/brush/engine.types";
import { type Ctx2D, type CanvasLike, get2D } from "@backends/utils/canvas";

import { drawStampGraphite } from "./variants/graphite";
import { drawStampInk } from "./variants/ink";
import { drawStampMarker } from "./variants/marker";
import { drawStampCalligraphy } from "./variants/calligraphy";
import { drawStampScatter } from "./variants/scatter";
import { drawSingleStamp } from "./variants/stamp";
import { drawStampOrnament } from "./variants/ornament";

// 👇 import your tilt normalization helper (adjust path if yours differs)
import { getTiltOverrides } from "@backends/stamping/utils/scalars";

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
  /** Preferred selector: engine.backendOverrides.stamping.mode */
  mode: StampingMode;
  /** Calligraphy-only: chisel nib angle in degrees. */
  nibAngleDeg: number;
  /** Clamp minimum tip width in CSS px. */
  tipMinPx: number;
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

  // Preferred path
  if (isStampingMode(local?.mode)) return local.mode;

  // --- Legacy shim (read-only): engine.overrides.stampingMode ---
  // Do NOT add this to RenderOverrides; keep it local until presets migrate.
  const legacy = opt.engine.overrides as { stampingMode?: unknown } | undefined;
  if (isStampingMode(legacy?.stampingMode)) return legacy.stampingMode;

  // Default
  return "graphite";
}

/** Core entry: draw using the selected variant. */
export default function drawStamping(ctx: Ctx2D, opt: RenderOptions): void {
  // --- Normalize tilt knobs ONCE here, then pass to all variants -------------
  // getTiltOverrides returns a normalized bag like:
  // { tiltToSize: number, tiltToFan: number, tiltToGrainScale: number, tiltToEdgeNoise: number }
  const tilt = getTiltOverrides(opt.engine.overrides);

  // Merge them into engine.overrides so variants can read `ov.tiltToFan`, etc.
  // Note: we never assign explicit `undefined` (friendly to exactOptionalPropertyTypes)
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
      drawStampInk(ctx, optWithTilt);
      break;
    case "marker":
      drawStampMarker(ctx, optWithTilt);
      break;
    case "calligraphy":
      drawStampCalligraphy(ctx, optWithTilt);
      break;
    case "scatter":
      drawStampScatter(ctx, optWithTilt);
      break;
    case "stamp":
      drawSingleStamp(ctx, optWithTilt);
      break;
    case "ornament":
      drawStampOrnament(ctx, optWithTilt);
      break;
    case "graphite":
    default:
      drawStampGraphite(ctx, optWithTilt);
      break;
  }
}

/** Convenience: accept a canvas surface, fetch a 2D context, then draw. */
export function drawToCanvas(surface: CanvasLike, opt: RenderOptions): void {
  const ctx = get2D(surface);
  drawStamping(ctx, opt);
}
