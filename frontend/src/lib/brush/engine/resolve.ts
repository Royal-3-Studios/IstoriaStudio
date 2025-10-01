// FILE: src/lib/brush/engine/resolve.ts
import type {
  BrushBackend,
  RenderingIntent,
  EngineConfig,
  RenderingResolution,
  IntentToResolutionMap,
} from "@/lib/brush/engine.types";

/**
 * Map high-level style intent -> concrete backend (+ stamping variant).
 * Expand as you implement new pipelines.
 */
const INTENT_TO_RESOLUTION: IntentToResolutionMap = {
  // stamping family
  ink: { backend: "stamping", stampingMode: "ink" },
  marker: { backend: "stamping", stampingMode: "ink" },
  graphite: { backend: "stamping", stampingMode: "graphite" },
  charcoal: { backend: "stamping", stampingMode: "graphite" },

  // other pipelines (fill out as implemented)
  wet: { backend: "wet" },
  wash: { backend: "wet" },
  smudge: { backend: "smudge" },
  spray: { backend: "spray" },
  pastel: { backend: "stamping", stampingMode: "graphite" }, // temporary mapping
};

export function resolveRendering(
  intent?: RenderingIntent
): RenderingResolution | undefined {
  return intent ? INTENT_TO_RESOLUTION[intent] : undefined;
}

/**
 * Apply a RenderingIntent to an EngineConfig.
 * - Does NOT overwrite explicit backend choice if it's not "auto"
 * - Does NOT overwrite explicit stamping overrides.renderingMode
 * Returns a shallow-cloned config (original untouched).
 *
 * IMPORTANT: With exactOptionalPropertyTypes, never assign `overrides: undefined`.
 * Omit the key when you don't want to change it.
 */
export function applyRenderingIntent(config: EngineConfig): EngineConfig {
  const intent = config.rendering?.intent;
  if (!intent) return config;

  const resolved = resolveRendering(intent);
  if (!resolved) return config;

  // Decide backend: only auto-pick when backend is "auto" or unset.
  const existingBackend = config.backend;
  const chosenBackend: BrushBackend =
    existingBackend && existingBackend !== "auto"
      ? existingBackend
      : resolved.backend;

  // Respect explicit stamping renderingMode if already set.
  const hasStampingMode = typeof config.overrides?.renderingMode === "string";

  const nextOverrides =
    chosenBackend === "stamping" && resolved.stampingMode && !hasStampingMode
      ? { ...(config.overrides ?? {}), renderingMode: resolved.stampingMode }
      : config.overrides;

  // Build result WITHOUT ever setting overrides to `undefined`
  return {
    ...config,
    backend: chosenBackend,
    ...(nextOverrides !== undefined ? { overrides: nextOverrides } : {}),
  };
}
