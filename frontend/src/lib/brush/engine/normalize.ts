// FILE: src/lib/brush/engine/normalize.ts
import type {
  NormalizedRenderOptions,
  RenderOptions,
  EngineConfig,
  RenderingMode,
  RenderingIntent,
  RenderOverrides,
} from "@/lib/brush/engine.types";
import { applyRenderingIntent } from "./resolve";
import { DEFAULT_BRUSH_INPUT } from "./inputDefaults";

/** Map legacy rendering.mode to a modern intent (optional, tweak as needed). */
function legacyModeToIntent(mode?: RenderingMode): RenderingIntent | undefined {
  switch (mode) {
    case "marker":
      return "ink";
    case "spray":
      return "spray";
    case "wet":
      return "wet";
    default:
      return undefined; // "blended"/"glazed" left unmapped
  }
}

/** Shallow-merge engine + runtime overrides, with runtime taking precedence. */
function mergeOverrides(
  engineOv?: Partial<RenderOverrides>,
  runtimeOv?: Partial<RenderOverrides>
): Partial<RenderOverrides> | undefined {
  if (!engineOv && !runtimeOv) return undefined;
  if (!engineOv) return { ...runtimeOv };
  if (!runtimeOv) return { ...engineOv };
  return { ...engineOv, ...runtimeOv };
}

/** exactOptionalPropertyTypes-safe builder (never writes `undefined`). */
function buildEngine(config?: EngineConfig): Required<EngineConfig> {
  const cfg = config ?? {};
  const legacyIntent =
    cfg.rendering?.intent ?? legacyModeToIntent(cfg.rendering?.mode);

  const rendering = cfg.rendering
    ? { ...cfg.rendering, ...(legacyIntent ? { intent: legacyIntent } : {}) }
    : legacyIntent
      ? { intent: legacyIntent }
      : {};

  const resolved = applyRenderingIntent({ ...cfg, rendering });

  return {
    version: resolved.version ?? 1,
    backend: resolved.backend ?? "auto",
    shape: resolved.shape ?? {},
    strokePath: resolved.strokePath ?? {},
    grain: resolved.grain ?? {},
    rendering: resolved.rendering ?? {},
    overrides: resolved.overrides ?? {},
    modulations: resolved.modulations as unknown,
    backendOverrides: resolved.backendOverrides ?? {},
  };
}

export function normalizeOptions(opt: RenderOptions): NormalizedRenderOptions {
  const pixelRatio = opt.pixelRatio ?? opt.dpr ?? 1;
  const color = opt.color ?? "#000000";

  // Build & resolve engine
  const engine = buildEngine(opt.engine);

  // Merge runtime overrides over engine overrides (runtime wins)
  const mergedOverrides = mergeOverrides(engine.overrides, opt.overrides);
  const normalizedEngine: Required<typeof engine> = mergedOverrides
    ? { ...engine, overrides: mergedOverrides }
    : engine;

  return {
    ...opt,
    engine: normalizedEngine,
    pixelRatio,
    color,
    input: opt.input ?? DEFAULT_BRUSH_INPUT, // ← typed, no `any`
    width: opt.width,
    height: opt.height,
    baseSizePx: opt.baseSizePx,
  };
}
