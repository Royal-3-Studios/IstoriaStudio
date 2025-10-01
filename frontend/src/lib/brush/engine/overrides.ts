// FILE: src/lib/brush/engine/overrides.ts
import type {
  EngineConfig,
  BackendOverrides,
  RenderOverrides,
} from "@/lib/brush/engine.types";

/**
 * Merge view of overrides for a specific backend:
 * - namespaced backendOverrides[key] (backend-local knobs)
 * - plus generic engine.overrides (global knobs)
 * Generic wins only where fields intentionally overlap.
 */
export function getBackendOverrides<T extends keyof BackendOverrides>(
  engine: EngineConfig,
  key: T
): NonNullable<BackendOverrides[T]> & Partial<RenderOverrides> {
  const generic = engine.overrides ?? {};
  const namespaced = (engine.backendOverrides?.[key] ?? {}) as NonNullable<
    BackendOverrides[T]
  >;
  return { ...namespaced, ...generic };
}

/* ---------- Narrowed convenience wrappers for ALL backends ---------- */
/* These stay fully type-safe without importing individual types. */

export const getStampingOverrides = (engine: EngineConfig) =>
  getBackendOverrides(engine, "stamping");

export const getRibbonOverrides = (engine: EngineConfig) =>
  getBackendOverrides(engine, "ribbon");

export const getSmudgeOverrides = (engine: EngineConfig) =>
  getBackendOverrides(engine, "smudge");

export const getSprayOverrides = (engine: EngineConfig) =>
  getBackendOverrides(engine, "spray");

export const getWetOverrides = (engine: EngineConfig) =>
  getBackendOverrides(engine, "wet");

export const getParticleOverrides = (engine: EngineConfig) =>
  getBackendOverrides(engine, "particle");

export const getPatternOverrides = (engine: EngineConfig) =>
  getBackendOverrides(engine, "pattern");

export const getImpastoOverrides = (engine: EngineConfig) =>
  getBackendOverrides(engine, "impasto");
