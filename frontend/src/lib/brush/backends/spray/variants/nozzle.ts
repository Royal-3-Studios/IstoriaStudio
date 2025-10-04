// src/lib/brush/backends/spray/variants/nozzle.ts
import type { RenderOptions } from "@/lib/brush/engine";
import type { Ctx2D } from "../utils/canvas";
import { drawSprayAirbrush } from "./airbrush";

/**
 * “Nozzle” is a thin wrapper that just forces a directional cone spread.
 * We reuse the airbrush implementation and tweak backendOverrides.spray.coneAngleDeg if absent.
 */
export function drawSprayNozzle(ctx: Ctx2D, opt: RenderOptions): void {
  const spr = (opt.engine.backendOverrides ??
    (opt.engine.backendOverrides = {})) as {
    spray?: Record<string, unknown>;
  };
  if (!spr.spray) spr.spray = {};
  if (typeof spr.spray.coneAngleDeg !== "number") {
    spr.spray.coneAngleDeg = 30; // default nozzle fan
  }
  drawSprayAirbrush(ctx, opt);
}
