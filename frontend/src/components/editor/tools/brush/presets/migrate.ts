// FILE: src/lib/brush/presets/migrate.ts
/**
 * Preset migrations — versioned transforms (pure, deterministic)
 */

import type { AnyBrushPreset, BrushPresetV1 } from "./schema";
import { PRESET_VERSION, isValidPreset } from "./schema";
import type { EngineConfig } from "@/lib/brush/engine";

/** Public migration entry point. */
export function migratePreset(input: unknown): AnyBrushPreset {
  // Already current and valid → return as-is.
  if (isValidPreset(input) && input.presetVersion === PRESET_VERSION) {
    return input; // type is AnyBrushPreset thanks to the guard
  }

  // Revival path for early exports that looked like V1 but lacked presetVersion.
  if (looksLikeV1(input)) {
    const obj = input as Record<string, unknown>;

    const name = typeof obj.name === "string" ? obj.name : "Untitled";

    const engineObj: Record<string, unknown> = isPlainObject(obj.engine)
      ? (obj.engine as Record<string, unknown>)
      : {};

    const thumbnail =
      typeof obj.thumbnail === "string" ? obj.thumbnail : undefined;

    const meta = isPlainObject(obj.meta)
      ? (obj.meta as BrushPresetV1["meta"])
      : undefined;

    // Scoped assertion: schema expects EngineConfig; engine.ts will normalize.
    const revived: BrushPresetV1 = {
      presetVersion: 1,
      name,
      engine: engineObj as unknown as EngineConfig,
      thumbnail,
      meta,
    };

    if (isValidPreset(revived)) return revived;
  }

  throw new Error("Unsupported or invalid preset; cannot migrate.");
}

/* --------------------------------- Helpers --------------------------------- */

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function looksLikeV1(x: unknown): x is Record<string, unknown> {
  if (!isPlainObject(x)) return false;
  const hasName = typeof x.name === "string";
  const hasEngine = isPlainObject(x.engine);
  const hasNoOrV1 =
    !("presetVersion" in x) ||
    (x as Record<string, unknown>).presetVersion === 1;
  return hasName && hasEngine && hasNoOrV1;
}
