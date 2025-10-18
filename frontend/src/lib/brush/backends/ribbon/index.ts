// FILE: src/lib/brush/backends/ribbon/index.ts

import type { RenderOptions, EngineStrokePath } from "@/lib/brush/engine.types";
import type { CanvasLike } from "@backends/utils/canvas";
import { get2D } from "@backends/utils/canvas";

import { drawRibbonToCanvas } from "./core/ribbon";
import type { RibbonOptions } from "./types";
import { getTiltOverrides } from "../stamping/utils/scalars";

/** All supported ribbon rendering modes. */
export type RibbonMode = "pencil" | "ink" | "calligraphy" | "marker";

/** Backend-local config attachable at engine.backendOverrides.ribbon */
export type RibbonBackendConfig = Partial<{
  mode: RibbonMode;
  nibAngleDeg: number; // reserved for future chisel/ellipse tips
  tipMinPx: number; // reserved
}>;

function getRibbonConfig(opt: RenderOptions): RibbonBackendConfig | undefined {
  const bo = (opt as any)?.engine?.backendOverrides as
    | { ribbon?: RibbonBackendConfig }
    | undefined;
  return bo?.ribbon;
}

/** Resolve concrete mode (default "pencil"). */
export function pickMode(opt: RenderOptions): RibbonMode {
  const m = getRibbonConfig(opt)?.mode;
  return m === "ink" || m === "calligraphy" || m === "marker" ? m : "pencil";
}

/** Per-mode defaults consumed by core/ribbon. */
function modeDefaults(mode: RibbonMode): Partial<RibbonOptions> & {
  cap?: CanvasLineCap;
} {
  switch (mode) {
    case "ink":
      return {
        spacing: 2,
        jitter: 0.1,
        streamline: 30,
        cap: "round",
        tip: { kind: "round" },
      };
    case "calligraphy":
      return {
        spacing: 2,
        jitter: 0.05,
        streamline: 35,
        cap: "round",
        tip: { kind: "round" },
      };
    case "marker":
      return {
        spacing: 2.2,
        jitter: 0.15,
        streamline: 25,
        cap: "round",
        tip: { kind: "round" },
      };
    case "pencil":
    default:
      return {
        spacing: 2.2,
        jitter: 0.12,
        streamline: 20,
        cap: "round",
        tip: { kind: "round" },
      };
  }
}

/** Extract the stroke path from RenderOptions (engine-specific). */
function getPathFromOptions(opt: RenderOptions): EngineStrokePath {
  // Adjust this if your engine stores the path elsewhere.
  const path = (opt as any)?.engine?.path ?? (opt as any)?.path;
  if (!path) {
    throw new Error(
      "ribbon/index: no EngineStrokePath found on RenderOptions (expected engine.path or path)."
    );
  }
  return path as EngineStrokePath;
}

/** Prepare the options object for the core/ribbon renderer (no extra fields). */
function prepareOptionsForCore(
  opt: RenderOptions
): RenderOptions & { strokePath: RibbonOptions } {
  // Merge normalized tilt overrides once
  const tilt = getTiltOverrides((opt as any)?.engine?.overrides);

  const withTilt: RenderOptions = {
    ...opt,
    engine: {
      ...(opt as any).engine,
      overrides: {
        ...((opt as any)?.engine?.overrides ?? {}),
        ...tilt,
      },
    },
  };

  const md = modeDefaults(pickMode(withTilt));

  // Keep any existing strokePath fields provided by caller
  const incomingStroke = (withTilt as any)?.strokePath ?? {};
  const strokePath: RibbonOptions = {
    spacing:
      typeof incomingStroke.spacing === "number"
        ? incomingStroke.spacing
        : md.spacing ?? 2,
    jitter:
      typeof incomingStroke.jitter === "number"
        ? incomingStroke.jitter
        : md.jitter ?? 0,
    streamline:
      typeof incomingStroke.streamline === "number"
        ? incomingStroke.streamline
        : md.streamline ?? 0,
    minSpacingPx:
      typeof incomingStroke.minSpacingPx === "number"
        ? incomingStroke.minSpacingPx
        : undefined,
    count: typeof incomingStroke.count === "number" ? incomingStroke.count : 1,
    cap:
      (incomingStroke.cap as CanvasLineCap | undefined) ??
      (md.cap as CanvasLineCap | undefined) ??
      "round",
    tip: (incomingStroke.tip as RibbonOptions["tip"] | undefined) ??
      md.tip ?? { kind: "round" },
  };

  // IMPORTANT: don't inject fields that RenderOptions doesn't declare (e.g., rendering)
  // Core will default flow to 100% if rendering?.flow is absent.

  return { ...(withTilt as RenderOptions), strokePath };
}

/** Primary entry when you already have a 2D context. */
export function drawRibbon(
  ctx: CanvasRenderingContext2D,
  opt: RenderOptions
): void {
  const optionsForCore = prepareOptionsForCore(opt);
  const path = getPathFromOptions(opt);
  // Call core with (surface, path, options)
  drawRibbonToCanvas(ctx.canvas as CanvasLike, path, optionsForCore);
}

/** Standard convenience: accept a canvas surface, fetch 2D, then draw via core. */
export function drawToCanvas(surface: CanvasLike, opt: RenderOptions): void {
  // Validate the surface/context (keeps parity with your helpers)
  get2D(surface);
  const optionsForCore = prepareOptionsForCore(opt);
  const path = getPathFromOptions(opt);
  drawRibbonToCanvas(surface, path, optionsForCore);
}

export default drawToCanvas;
