// FILE: src/lib/brush/presets/requirements.ts
import type { EngineConfig } from "@/lib/brush/engine";
import type { BrushPreset } from "@/data/brushPresets"; // adjust if your alias differs

// Non-nullable backend key type (safe for Record/Set keys)
export type BackendName = NonNullable<EngineConfig["backend"]>;

// Param "type" as defined by your BrushPreset params
export type ParamType = BrushPreset["params"][number]["type"] | string;

// Helpful type guard for runtime checks
export function isBackend(x: unknown): x is BackendName {
  return typeof x === "string" && BACKENDS.has(x as BackendName);
}

// All supported backends (readonly for safety)
export const BACKENDS: ReadonlySet<BackendName> = new Set<BackendName>([
  "stamping",
  "ribbon",
  "spray",
  "wet",
  "smudge",
  "particle",
  "pattern",
  "impasto",
  "auto",
]);

// Backend → required UI param types (readonly arrays; tweak as needed)
export const REQUIRED_PARAM_TYPES: Readonly<
  Record<BackendName, ReadonlyArray<ParamType>>
> = {
  stamping: ["size", "flow", "spacing"],
  ribbon: ["size", "flow", "smoothing"],
  spray: ["size", "flow", "spacing"],
  wet: ["size", "flow", "spacing"],
  smudge: ["size", "spacing", "smoothing"],
  particle: ["size", "spacing"],
  pattern: ["size", "spacing"],
  impasto: ["size", "flow", "spacing"],
  auto: ["size", "spacing"],
} as const;
