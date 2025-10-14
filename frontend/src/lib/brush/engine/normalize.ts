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

// Pull shared helpers so we don’t duplicate logic here
import {
  normalizeEngineConfig,
  mergeOverrides as mergeOverridesStrict,
  ensureInput,
  resolveDevicePixelRatio,
} from "../engine.utils";

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
function buildEngine(config?: EngineConfig): EngineConfig {
  const cfg = config ?? {};
  const legacyIntent =
    cfg.rendering?.intent ?? legacyModeToIntent(cfg.rendering?.mode);

  const rendering = cfg.rendering
    ? { ...cfg.rendering, ...(legacyIntent ? { intent: legacyIntent } : {}) }
    : legacyIntent
      ? { intent: legacyIntent }
      : {};

  // Apply intent → backend/stamping-mode resolution without mutating input
  return applyRenderingIntent({ ...cfg, rendering });
}

/**
 * Normalize a full render request into a safe, concrete option bag.
 * Delegates to the shared normalizers in ../engine.utils so there’s one source of truth.
 */
export function normalizeOptions(opt: RenderOptions): NormalizedRenderOptions {
  // 1) Resolve DPR — only via the modern pixelRatio (no legacy dpr support)
  const pixelRatio = resolveDevicePixelRatio(opt.pixelRatio);

  // 2) Build & resolve engine (legacy mode → intent; intent → backend)
  const engineResolved = buildEngine(opt.engine);

  // 3) Strict-normalize engine to a Required<EngineConfig>
  const engine = normalizeEngineConfig(engineResolved);

  // 4) Merge runtime overrides over normalized engine overrides (runtime wins)
  //    Use the strict merge from engine.utils (produces concrete defaults),
  //    but keep the shallow version here if you prefer your previous behavior.
  const mergedStrict = mergeOverridesStrict(engine.overrides, opt.overrides);
  const mergedShallow = mergeOverrides(engine.overrides, opt.overrides);
  // Prefer strict (concrete defaults) unless you explicitly want shallow:
  const overrides =
    mergedStrict ?? (mergedShallow as Required<RenderOverrides>);

  // 5) Input config (pressure curve + quality), using shared helper
  const input = ensureInput(opt.input);

  // 6) Concrete dimensions & base size
  const width = Math.max(1, Math.floor(opt.width));
  const height = Math.max(1, Math.floor(opt.height));
  const baseSizePx = Math.max(1, opt.baseSizePx);

  // 7) Assemble normalized options (omit undefineds; keep color defaulted)
  return {
    ...opt,
    pixelRatio,
    width,
    height,
    baseSizePx,
    color: opt.color ?? "#000000",
    engine: {
      ...engine,
      overrides, // runtime wins
    },
    input,
  };
}
