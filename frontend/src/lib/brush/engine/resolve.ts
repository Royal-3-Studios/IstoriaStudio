// FILE: src/lib/brush/engine/resolve.ts
import type {
  BrushBackend,
  RenderingIntent,
  EngineConfig,
  RenderingResolution,
  IntentToResolutionMap,
} from "@/lib/brush/engine.types";

/**
 * Map high-level style intent -> concrete backend (+ optional stamping variant).
 * Expand this as you implement new pipelines.
 */
const INTENT_TO_RESOLUTION: IntentToResolutionMap = Object.freeze({
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
} as const);

/** Look up a RenderingResolution for a given intent. */
export function resolveRendering(
  intent?: RenderingIntent
): RenderingResolution | undefined {
  return intent ? INTENT_TO_RESOLUTION[intent] : undefined;
}

/**
 * Apply a RenderingIntent to an EngineConfig.
 * - Does NOT overwrite explicit backend choice if it's not "auto".
 * - Does NOT overwrite an explicit backendOverrides.stamping.mode if present.
 * Returns a shallow-cloned config (original untouched).
 *
 * With exactOptionalPropertyTypes, we avoid assigning undefined — we only add keys when we have values.
 */
export function applyRenderingIntent(config: EngineConfig): EngineConfig {
  const intent = config.rendering?.intent;
  if (!intent) return config;

  const resolved = resolveRendering(intent);
  if (!resolved) return config;

  // Respect explicit backend selection
  const existingBackend = config.backend;
  const chosenBackend: BrushBackend =
    existingBackend && existingBackend !== "auto"
      ? existingBackend
      : resolved.backend;

  // Respect explicit stamping mode if already set
  const existingStampingMode = config.backendOverrides?.stamping?.mode;

  // Only add/merge stamping.mode if:
  // - we ended up with the stamping backend, and
  // - the intent specifies a stampingMode, and
  // - no explicit stamping.mode is already defined.
  let nextBackendOverrides = config.backendOverrides;
  if (
    chosenBackend === "stamping" &&
    resolved.stampingMode !== undefined &&
    existingStampingMode === undefined
  ) {
    nextBackendOverrides = {
      ...(config.backendOverrides ?? {}),
      stamping: {
        ...(config.backendOverrides?.stamping ?? {}),
        mode: resolved.stampingMode,
      },
    };
  }

  // Return new config; omit keys rather than setting undefined
  return {
    ...config,
    backend: chosenBackend,
    ...(nextBackendOverrides !== undefined
      ? { backendOverrides: nextBackendOverrides }
      : {}),
  };
}
