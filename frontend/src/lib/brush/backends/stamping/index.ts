// FILE: src/lib/brush/backends/stamping/index.ts
import type { RenderOptions } from "@/lib/brush/engine";
import type { Ctx2D } from "./utils/canvas";

import { drawStampGraphite } from "./variants/graphite";
import { drawStampInk } from "./variants/ink";
import { drawStampMarker } from "./variants/marker";
import { drawStampCalligraphy } from "./variants/calligraphy";
import { drawStampScatter } from "./variants/scatter";
import { drawSingleStamp } from "./variants/stamp";
import { drawStampOrnament } from "./variants/ornament";

/** High-level stamping modes. */
export type StampingMode =
  | "graphite"
  | "ink"
  | "marker"
  | "calligraphy"
  | "scatter"
  | "stamp"
  | "ornament";

export type StampingOverrides = Partial<{
  /** Selects which variant to draw (also settable via backendOverrides.stamping.mode). */
  stampingMode: StampingMode;

  /** Calligraphy-only: chisel nib angle in degrees. */
  nibAngleDeg: number;

  /** Clamp minimum tip width in CSS px. */
  tipMinPx: number;
}>;

function pickMode(opt: RenderOptions): StampingMode {
  const local = opt.engine.backendOverrides?.stamping as
    | { mode?: StampingMode }
    | undefined;

  const m =
    local?.mode ??
    (opt.engine.overrides?.stampingMode as StampingMode | undefined);

  switch (m) {
    case "ink":
    case "marker":
    case "calligraphy":
    case "scatter":
    case "stamp":
    case "ornament":
      return m;
    default:
      return "graphite";
  }
}

export default function drawStamping(ctx: Ctx2D, opt: RenderOptions): void {
  switch (pickMode(opt)) {
    case "ink":
      drawStampInk(ctx, opt);
      break;
    case "marker":
      drawStampMarker(ctx, opt);
      break;
    case "calligraphy":
      drawStampCalligraphy(ctx, opt);
      break;
    case "scatter":
      drawStampScatter(ctx, opt);
      break;
    case "stamp":
      drawSingleStamp(ctx, opt);
      break;
    case "ornament":
      drawStampOrnament(ctx, opt);
      break;
    case "graphite":
    default:
      drawStampGraphite(ctx, opt);
      break;
  }
}
