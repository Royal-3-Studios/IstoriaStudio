// FILE: scripts/validate-presets.ts
/**
 * Brush preset validator — CI fast-fail
 * Run:  npm run validate:presets
 *
 * Checks:
 * - Basic shape (id, name, params[], engine.backend)
 * - Param bounds (spacing 1–30, angle 0–360, hardness/flow/opacity/smoothing 0–100)
 * - Backend-specific required params
 * - Common override bounds (tipRoundness 0–1, softness 0–100, angleDeg 0–360 when present)
 */

import type { BrushPreset } from "../src/data/brushPresets";
import type { EngineConfig } from "../src/lib/brush/engine";

/* ============================== Types ============================== */

type BackendName = NonNullable<EngineConfig["backend"]>;

type ParamType = BrushPreset["params"][number]["type"] | string;

type CategoryShape = {
  brushes: BrushPreset[];
  // allow additional keys in your category structure without using `any`
  [k: string]: unknown;
};

type FlatExport = { allBrushPresets: BrushPreset[] };

// Two possible shapes for categorized exports:
// 1) { categories: CategoryShape[] }
// 2) { BRUSH_CATEGORIES: CategoryShape[] } (your generated module)
type CategorizedExportStd = { categories: CategoryShape[] };
type CategorizedExportGen = { BRUSH_CATEGORIES: CategoryShape[] };

type PresetSource =
  | { type: "flat"; presets: BrushPreset[] }
  | { type: "categorized"; categories: CategoryShape[] };

/* ============================== Guards ============================= */

function isFlatExport(mod: unknown): mod is FlatExport {
  return (
    typeof mod === "object" &&
    mod !== null &&
    "allBrushPresets" in mod &&
    Array.isArray((mod as Record<string, unknown>).allBrushPresets)
  );
}

function isCategorizedExportStd(mod: unknown): mod is CategorizedExportStd {
  if (!(typeof mod === "object" && mod !== null && "categories" in mod)) {
    return false;
  }
  const cats = (mod as Record<string, unknown>).categories;
  if (!Array.isArray(cats)) return false;
  return cats.every(
    (c) =>
      typeof c === "object" &&
      c !== null &&
      "brushes" in (c as Record<string, unknown>) &&
      Array.isArray((c as Record<string, unknown>).brushes)
  );
}

function isCategorizedExportGen(mod: unknown): mod is CategorizedExportGen {
  if (!(typeof mod === "object" && mod !== null && "BRUSH_CATEGORIES" in mod)) {
    return false;
  }
  const cats = (mod as Record<string, unknown>).BRUSH_CATEGORIES;
  if (!Array.isArray(cats)) return false;
  return cats.every(
    (c) =>
      typeof c === "object" &&
      c !== null &&
      "brushes" in (c as Record<string, unknown>) &&
      Array.isArray((c as Record<string, unknown>).brushes)
  );
}

/* =========================== Loader (ESM) =========================== */

async function loadPresets(): Promise<PresetSource> {
  // Prefer generated; fall back to hand-authored
  try {
    const mod = await import("../src/data/brushPresets.generated");
    if (isFlatExport(mod)) {
      return { type: "flat", presets: mod.allBrushPresets };
    }
    if (isCategorizedExportStd(mod)) {
      return { type: "categorized", categories: mod.categories };
    }
    if (isCategorizedExportGen(mod)) {
      return { type: "categorized", categories: mod.BRUSH_CATEGORIES };
    }
  } catch {
    // ignore and try the next source
  }

  const mod2 = await import("../src/data/brushPresets");
  if (isFlatExport(mod2)) {
    return { type: "flat", presets: mod2.allBrushPresets };
  }
  if (isCategorizedExportStd(mod2)) {
    return { type: "categorized", categories: mod2.categories };
  }
  if (isCategorizedExportGen(mod2)) {
    return { type: "categorized", categories: mod2.BRUSH_CATEGORIES };
  }

  throw new Error(
    "Could not find presets. Export either `allBrushPresets` (flat), `categories`, or `BRUSH_CATEGORIES` from src/data/brushPresets.generated(.ts) or src/data/brushPresets(.ts)."
  );
}

/* ======================== Validation Rules ========================= */

const BACKENDS = new Set<BackendName>([
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

// Backend → required UI params (by BrushParam.type)
const REQUIRED_PARAMS: Record<BackendName, ReadonlyArray<ParamType>> = {
  stamping: ["size", "flow", "spacing"],
  ribbon: ["size", "flow", "smoothing"],
  spray: ["size", "flow", "spacing"],
  wet: ["size", "flow", "spacing"],
  smudge: ["size", "spacing", "smoothing"],
  particle: ["size", "spacing"],
  pattern: ["size", "spacing"],
  impasto: ["size", "flow", "spacing"],
  auto: ["size", "spacing"],
};

const inRange = (v: number, lo: number, hi: number): boolean =>
  v >= lo && v <= hi;

function hasParamType(p: BrushPreset, type: ParamType): boolean {
  return Array.isArray(p.params) && p.params.some((pp) => pp.type === type);
}
function getParamByType(p: BrushPreset, type: ParamType) {
  return Array.isArray(p.params)
    ? p.params.find((pp) => pp.type === type)
    : undefined;
}

function validatePreset(p: BrushPreset, idx: number): string[] {
  const errs: string[] = [];
  const id = p.id ?? `#${idx}`;

  // Basic shape
  if (!p.id || typeof p.id !== "string") errs.push("missing/invalid id");
  if (!p.name || typeof p.name !== "string") errs.push("missing/invalid name");
  if (!Array.isArray(p.params)) errs.push("params must be an array");
  if (!p.engine) errs.push("missing engine");

  const backendRaw: EngineConfig["backend"] = p.engine?.backend ?? "stamping";
  const backend = backendRaw as BackendName;
  if (!BACKENDS.has(backend))
    errs.push(`invalid backend '${String(backendRaw)}'`);

  // Required params per backend
  const req = REQUIRED_PARAMS[backend] ?? [];
  for (const t of req) {
    if (!hasParamType(p, t)) errs.push(`missing required param type '${t}'`);
  }

  // Param bounds (when present)
  const spacing = getParamByType(p, "spacing");
  if (spacing) {
    const v = spacing.defaultValue;
    if (typeof v !== "number" || !inRange(v, 1, 30)) {
      errs.push(`spacing.defaultValue ${String(v)} out of range (1–30)`);
    }
  }

  const angle = getParamByType(p, "angle");
  if (angle) {
    const v = angle.defaultValue;
    if (typeof v !== "number" || !inRange(v, 0, 360)) {
      errs.push(`angle.defaultValue ${String(v)} out of range (0–360)`);
    }
  }

  const hardness = getParamByType(p, "hardness");
  if (hardness) {
    const v = hardness.defaultValue;
    if (typeof v !== "number" || !inRange(v, 0, 100)) {
      errs.push(`hardness.defaultValue ${String(v)} out of range (0–100)`);
    }
  }

  const flow = getParamByType(p, "flow");
  if (flow) {
    const v = flow.defaultValue;
    if (typeof v !== "number" || !inRange(v, 0, 100)) {
      errs.push(`flow.defaultValue ${String(v)} out of range (0–100)`);
    }
  }

  const smoothing = getParamByType(p, "smoothing");
  if (smoothing) {
    const v = smoothing.defaultValue;
    if (typeof v !== "number" || !inRange(v, 0, 100)) {
      errs.push(`smoothing.defaultValue ${String(v)} out of range (0–100)`);
    }
  }

  const opacity = getParamByType(p, "opacity");
  if (opacity) {
    const v = opacity.defaultValue;
    if (typeof v !== "number" || !inRange(v, 0, 100)) {
      errs.push(`opacity.defaultValue ${String(v)} out of range (0–100)`);
    }
  }

  // Common override sanity checks (when present)
  const ov: Readonly<Record<string, unknown>> = (p.engine?.overrides ??
    {}) as Readonly<Record<string, unknown>>;

  if (Object.prototype.hasOwnProperty.call(ov, "tipRoundness")) {
    const v = Number(ov["tipRoundness"]);
    if (!Number.isFinite(v) || !inRange(v, 0, 1)) {
      errs.push(
        `overrides.tipRoundness ${String(ov["tipRoundness"])} out of range (0–1)`
      );
    }
  }

  // NOTE: In your engine types, `overrides.softness` is 0..100 (not 0..1).
  if (Object.prototype.hasOwnProperty.call(ov, "softness")) {
    const v = Number(ov["softness"]);
    if (!Number.isFinite(v) || !inRange(v, 0, 100)) {
      errs.push(
        `overrides.softness ${String(ov["softness"])} out of range (0–100)`
      );
    }
  }

  if (Object.prototype.hasOwnProperty.call(ov, "angleDeg")) {
    const v = Number(ov["angleDeg"]);
    if (!Number.isFinite(v) || !inRange(v, 0, 360)) {
      errs.push(
        `overrides.angleDeg ${String(ov["angleDeg"])} out of range (0–360)`
      );
    }
  }

  return errs.map((e) => `[${id}] ${e}`);
}

/* =============================== Main =============================== */

(async () => {
  try {
    const src = await loadPresets();
    const presets: BrushPreset[] =
      src.type === "flat"
        ? src.presets
        : src.categories.flatMap((c) => c.brushes);

    const allErrs: string[] = [];
    presets.forEach((p, i) => {
      allErrs.push(...validatePreset(p, i));
    });

    if (allErrs.length > 0) {
      // eslint-disable-next-line no-console
      console.error("❌ Preset validation failed:\n" + allErrs.join("\n"));
      process.exit(1);
    } else {
      // eslint-disable-next-line no-console
      console.log(`✅ ${presets.length} presets valid.`);
      process.exit(0);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error("❌ Validator crashed:", msg);
    process.exit(1);
  }
})();
