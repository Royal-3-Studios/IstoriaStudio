// FILE: src/lib/brush/presets/schema.ts
/**
 * Preset schema (runtime-validated, versioned)
 * - Minimal, dependency-free guards (no zod)
 * - Stable surface for sharing + migrations
 */

import type { EngineConfig } from "@/lib/brush/engine";

/** Current preset version. Bump when the top-level preset shape changes. */
export const PRESET_VERSION = 1 as const;

/** V1 preset: minimal, stable surface */
export type BrushPresetV1 = {
  /** Discriminant for migration/versioning */
  presetVersion: 1;

  /** Display name shown in UI */
  name: string;

  /** Engine config (engine.ts later normalizes this) */
  engine: EngineConfig;

  /** Optional base64 data URL for a thumbnail preview */
  thumbnail?: string;

  /** Optional arbitrary metadata (author, tags, etc.) */
  meta?: {
    author?: string;
    category?: string;
    tags?: string[];
    createdAt?: string; // ISO date
    updatedAt?: string; // ISO date
    [k: string]: unknown;
  };
};

/** Union of all known preset versions (expand as you add V2, V3, …) */
export type AnyBrushPreset = BrushPresetV1;

/* -------------------------------------------------------------------------- */
/* Guards                                                                     */
/* -------------------------------------------------------------------------- */

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function isString(x: unknown): x is string {
  return typeof x === "string";
}

function maybeString(x: unknown): x is string | undefined {
  return x === undefined || typeof x === "string";
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === "string");
}

/** We don’t validate full EngineConfig here; engine.ts normalizes it. */
function isEngineConfigLike(x: unknown): x is EngineConfig {
  return isPlainObject(x);
}

/** Runtime validator for AnyBrushPreset. */
export function isValidPreset(json: unknown): json is AnyBrushPreset {
  if (!isPlainObject(json)) return false;

  if (json.presetVersion !== 1) return false;
  if (!isString(json.name)) return false;
  if (!isEngineConfigLike(json.engine)) return false;

  if (!maybeString(json.thumbnail)) return false;
  if (json.meta !== undefined) {
    if (!isPlainObject(json.meta)) return false;
    const m = json.meta as Record<string, unknown>;
    if (m.author !== undefined && !isString(m.author)) return false;
    if (m.category !== undefined && !isString(m.category)) return false;
    if (m.tags !== undefined && !isStringArray(m.tags)) return false;
    if (m.createdAt !== undefined && !isString(m.createdAt)) return false;
    if (m.updatedAt !== undefined && !isString(m.updatedAt)) return false;
  }

  return true;
}

/* -------------------------------------------------------------------------- */
/* Construction & I/O helpers                                                 */
/* -------------------------------------------------------------------------- */

export function makePresetV1(args: {
  name: string;
  engine: EngineConfig;
  thumbnail?: string;
  meta?: BrushPresetV1["meta"];
}): BrushPresetV1 {
  return {
    presetVersion: PRESET_VERSION,
    name: args.name,
    engine: args.engine,
    thumbnail: args.thumbnail,
    meta: args.meta,
  };
}

/** Serialize to portable JSON string. */
export function serializePreset(preset: AnyBrushPreset): string {
  return JSON.stringify(preset);
}

/** Parse + validate (throws if invalid). */
export function parsePreset(jsonStr: string): AnyBrushPreset {
  const parsed = JSON.parse(jsonStr);
  if (!isValidPreset(parsed)) {
    throw new Error("Invalid brush preset JSON.");
  }
  return parsed;
}

/** Safe parse (returns null instead of throwing). */
export function tryParsePreset(jsonStr: string): AnyBrushPreset | null {
  try {
    return parsePreset(jsonStr);
  } catch {
    return null;
  }
}
