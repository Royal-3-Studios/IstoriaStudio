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
 * - Does NOT overwrite an explicit backendOverrides.stamping.mode if present
 * Returns a shallow-cloned config (original untouched).
 *
 * With exactOptionalPropertyTypes, we never assign properties to `undefined`;
 * we only include keys when we have values.
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

  // Respect explicit stamping mode if already set in backendOverrides
  const existingStampingMode =
    config.backendOverrides?.stamping?.mode ?? undefined;

  // Build next backendOverrides only if we actually need to set stamping.mode
  let nextBackendOverrides = config.backendOverrides;
  if (
    chosenBackend === "stamping" &&
    resolved.stampingMode &&
    existingStampingMode === undefined
  ) {
    nextBackendOverrides = {
      ...(config.backendOverrides ?? {}),
      stamping: {
        ...(config.backendOverrides?.stamping ?? {}),
        mode: resolved.stampingMode, // typed and backend-scoped
      },
    };
  }

  // Return new config (omit keys rather than writing undefined)
  return {
    ...config,
    backend: chosenBackend,
    ...(nextBackendOverrides !== undefined
      ? { backendOverrides: nextBackendOverrides }
      : {}),
  };
}
