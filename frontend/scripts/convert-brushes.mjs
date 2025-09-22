#!/usr/bin/env node
/**
 * Convert external brush JSON → your TS schema:
 * - Reads:  src/data/brush-import/brush-presets-v1.json
 * - Writes: src/data/brushPresets.generated.ts
 *
 * Mapping rules:
 * - strokePath: keep spacing/jitter/scatter/count/streamline
 * - overrides: tipScale*, uniformity, taperProfile*, angleFollowDirection,
 *   rim*, tooth*, centerlinePencil, coreStrength, speed*, bellyGain, endBias,
 *   thicknessCurve (render-only knobs)
 * - input: pressure + input-quality metadata (pressure clamp/curve/smoothing,
 *   velocity compensation, synth; predictPx/speedToSpacing/minStepPx)
 * - shape/grain/rendering mapped conservatively with fallbacks
 * - category → your categories; name → kebab id with uniqueness
 * - params: always size/flow/smoothing; add spacing for stamping/particle/spray;
 *           add grain for dry/drawn/paint media
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IN_JSON = path.resolve(
  __dirname,
  "../src/data/brush-import/brush-presets-v1.json"
);
const OUT_TS = path.resolve(__dirname, "../src/data/brushPresets.generated.ts");

/* ----------------------------- Utilities ----------------------------- */

const kebab = (s) =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const deepMerge = (a, b) => {
  if (Array.isArray(a) || Array.isArray(b)) return b ?? a;
  if (a && typeof a === "object" && b && typeof b === "object") {
    const out = { ...a };
    for (const k of Object.keys(b)) {
      out[k] = deepMerge(a[k], b[k]);
    }
    return out;
  }
  return b ?? a;
};

function mapCategory(srcCat, baseName, brushName) {
  const s = String(srcCat || baseName || "").toLowerCase();
  if (/(pencil|graphite|sketch)/.test(s))
    return { id: "sketching", name: "Sketching" };
  if (/(ink|liner|pen|studio|technical|gel)/.test(s))
    return { id: "inking", name: "Inking" };
  if (/(charcoal|conte|dry|chalk)/.test(s))
    return { id: "dry-media", name: "Dry Media (Graphite · Charcoal · Conté)" };
  if (/(oil|paint|impasto|watercolor|wash|wet)/.test(s))
    return { id: "painting", name: "Painting" };
  if (/(air|spray|airbrush|particle|fx)/.test(s))
    return { id: "airbrushing", name: "Airbrushing" };
  if (/(texture|pattern|hatch|canvas)/.test(s))
    return { id: "textures", name: "Textures" };
  if (/(glow|light|luminance|neon)/.test(s))
    return { id: "luminance", name: "Luminance" };
  const n = `${baseName || ""} ${brushName || ""}`.toLowerCase();
  if (/pen|ink|gel|studio|technical/.test(n))
    return { id: "inking", name: "Inking" };
  if (/pencil|graphite|charcoal/.test(n))
    return { id: "sketching", name: "Sketching" };
  return { id: "abstract", name: "Abstract" };
}

/** Keep `particle` distinct from `spray` (important for airbrush behavior). */
function chooseBackend(baseBackend, nameGuess) {
  const raw = String(baseBackend || nameGuess || "").toLowerCase();

  // If the base already specifies a backend, keep it.
  if (baseBackend) {
    const bb = String(baseBackend).toLowerCase();
    if (bb === "particle") return "particle";
    if (bb === "spray") return "spray";
    if (bb === "ribbon") return "ribbon";
    if (bb === "wet") return "wet";
    if (bb === "impasto") return "impasto";
    if (bb === "pattern") return "pattern";
    if (bb === "stamping") return "stamping";
  }

  // Infer from name
  if (/ribbon|technical|studio|gel|chisel|nib/.test(raw)) return "ribbon";
  if (/particle|airbrush/.test(raw)) return "particle";
  if (/spray|nozzle|splatter|flick/.test(raw)) return "spray";
  if (/wet|watercolor/.test(raw)) return "wet";
  if (/impasto/.test(raw)) return "impasto";
  if (/pattern|hatch|halftone/.test(raw)) return "pattern";
  if (/pencil|graphite|charcoal|dry|felt|mercury|inka|tinder/.test(raw))
    return "stamping";
  return "stamping";
}

function defaultGrainFor(catId, backend) {
  if (backend === "ribbon") return { kind: "none", depth: 0, scale: 1.0 };
  if (backend === "wet") return { kind: "paper", depth: 35, scale: 1.1 };
  if (backend === "impasto") return { kind: "canvas", depth: 65, scale: 1.0 };
  if (backend === "pattern") return { kind: "paper", depth: 0, scale: 1.0 };
  if (backend === "spray" || backend === "particle")
    return { kind: "none", depth: 0, scale: 1.0 };

  if (catId === "sketching") return { kind: "paper", depth: 60, scale: 1.15 };
  if (catId === "dry-media") return { kind: "noise", depth: 68, scale: 1.25 };
  if (catId === "painting") return { kind: "canvas", depth: 55, scale: 1.0 };
  if (catId === "textures") return { kind: "paper", depth: 70, scale: 1.2 };
  if (catId === "luminance") return { kind: "none", depth: 0, scale: 1.0 };
  return { kind: "paper", depth: 52, scale: 1.1 };
}

function mapRendering(modeGuess, backend) {
  const s = String(modeGuess || "").toLowerCase();
  if (s.includes("marker") || backend === "ribbon")
    return { mode: "marker", wetEdges: false, flow: 100 };
  if (s.includes("wet") || backend === "wet")
    return { mode: "wet", wetEdges: true, flow: 60 };
  if (s.includes("spray") || backend === "spray" || backend === "particle")
    return { mode: "spray", wetEdges: false, flow: 55 };
  if (
    s.includes("blended") ||
    /oil|paint|impasto/.test(s) ||
    backend === "impasto"
  )
    return { mode: "blended", wetEdges: false, flow: 75 };
  return { mode: "marker", wetEdges: false, flow: 100 };
}

function ensureUniqueId(baseId, used) {
  let id = baseId || "brush";
  let i = 1;
  while (used.has(id)) {
    i += 1;
    id = `${baseId}-${String(i).padStart(2, "0")}`;
  }
  used.add(id);
  return id;
}

function pickParams(backend, catId, defSize, hasGrain) {
  const params = [];
  const size = clamp(Math.round(defSize ?? 12), 2, 28);
  params.push(
    p(
      "size",
      "Size",
      "size",
      size,
      1,
      backend === "spray" || backend === "particle" ? 160 : 120,
      1,
      true
    )
  );
  params.push(p("flow", "Flow", "flow", 100));
  params.push(p("smoothing", "Smoothing", "smoothing", 24));
  if (backend === "stamping" || backend === "spray" || backend === "particle") {
    params.push(
      p("spacing", "Spacing", "spacing", backend === "stamping" ? 3 : 8)
    );
  }
  if (
    hasGrain ||
    catId === "sketching" ||
    catId === "dry-media" ||
    catId === "painting"
  ) {
    params.push(p("grain", "Grain", "grain", 52));
  }
  return params;
}

// param descriptor (mirrors your TS shape)
function p(key, label, type, def, min = 0, max = 100, step = 1, show) {
  return {
    key,
    label,
    type,
    defaultValue: def,
    min,
    max,
    step,
    ...(show === false ? { show } : {}),
  };
}

/* ----------------------------- Main Convert ----------------------------- */

async function run() {
  const raw = await fs.readFile(IN_JSON, "utf8");
  /** Expecting:
   * {
   *   version,
   *   defaults: { pressureDefaults, inputQualityDefaults },
   *   bases: { [key]: Base },
   *   brushes: [{ name, base, category?, subtitle?, overrides?, baseSizePx? }, ...]
   * }
   */
  const J = JSON.parse(raw);

  const defaults = J.defaults || {};
  const defaultPressure = defaults.pressureDefaults || {};
  const defaultQuality = defaults.inputQualityDefaults || {};

  const bases = J.bases || J.presets || {};
  const list = J.brushes || J.items || J.list || [];

  const usedIds = new Set();
  const categoryMap = new Map(); // id -> { id, name, brushes: [] }

  for (const b of list) {
    const baseKey = b.base || b.parent || b.kind || "";
    const base = bases[baseKey] || {};
    const merged = deepMerge(base, b.overrides || b.override || {});

    const brushName = b.name || merged.name || base.name || "Brush";
    const subtitle = b.subtitle || merged.subtitle || "";
    const backend = chooseBackend(merged.backend || base.backend, brushName);
    const cat = mapCategory(b.category, baseKey, brushName);

    // strokePath parts
    const sp = merged.strokePath || merged.path || {};
    const strokePath = {
      spacing: sp.spacing ?? 3,
      jitter: sp.jitter ?? 0,
      scatter: sp.scatter ?? 0,
      streamline: sp.streamline ?? b.smoothing ?? 24,
      count: sp.count ?? 1,
    };

    // render overrides (engine-level)
    const ov = {
      // taper & tips
      tipScaleStart: sp.tipScaleStart ?? merged.tipScaleStart,
      tipScaleEnd: sp.tipScaleEnd ?? merged.tipScaleEnd,
      tipMinPx: sp.tipMinPx ?? merged.tipMinPx,
      tipRoundness: sp.tipRoundness ?? merged.tipRoundness,
      // body shaping
      uniformity: merged.uniformity,
      bellyGain: merged.bellyGain,
      endBias: merged.endBias,
      thicknessCurve: merged.thicknessCurve,
      // taper profiles & steering
      taperProfileStart: merged.taperProfileStart,
      taperProfileEnd: merged.taperProfileEnd,
      angleFollowDirection: merged.angleFollowDirection,
      // rim & tooth
      rimMode: merged.rimMode,
      rimStrength: merged.rimStrength,
      toothBody: merged.toothBody,
      toothFlank: merged.toothFlank,
      toothScale: merged.toothScale,
      // pencil/centerline & ribbon core
      centerlinePencil: merged.centerlinePencil,
      coreStrength: merged.coreStrength,
      // speed dynamics
      speedToWidth: merged.speedToWidth,
      speedToFlow: merged.speedToFlow,
      speedSmoothingMs: merged.speedSmoothingMs,
    };
    for (const k of Object.keys(ov)) if (ov[k] === undefined) delete ov[k];

    // shape
    const sh = merged.shape || base.shape || {};
    const shape = {
      type: sh.type || guessShape(backend, brushName),
      angle: sh.angle ?? 0,
      softness: sh.softness ?? (backend === "ribbon" ? 100 : 50),
      roundness: sh.roundness ?? 40,
      sizeScale: sh.sizeScale ?? 1.0,
    };

    // grain
    const g = merged.grain || base.grain || {};
    const defGr = defaultGrainFor(cat.id, backend);
    const grain = {
      kind: g.kind || defGr.kind,
      depth: g.depth ?? defGr.depth,
      scale: g.scale ?? defGr.scale,
      ...(g.rotate != null ? { rotate: g.rotate } : {}),
    };

    // rendering
    const rendering = mapRendering(
      merged.rendering?.mode || base.rendering?.mode,
      backend
    );
    if (merged.rendering?.flow != null) rendering.flow = merged.rendering.flow;
    if (merged.rendering?.wetEdges != null)
      rendering.wetEdges = !!merged.rendering.wetEdges;

    // params
    const baseSizePx = clamp(
      Math.round(b.baseSizePx ?? base.baseSizePx ?? 12),
      2,
      28
    );
    const hasGrain = grain.kind && grain.kind !== "none";
    const params = pickParams(backend, cat.id, baseSizePx, !!hasGrain);

    // ---- INPUT METADATA (pressure + quality) ----
    const mergedPressure = deepMerge(
      defaultPressure,
      deepMerge(base.pressureMap || {}, merged.pressureMap || {})
    );
    const mergedQuality = deepMerge(
      defaultQuality,
      deepMerge(base.inputQuality || {}, merged.inputQuality || {})
    );

    const input = {
      pressure: {
        clamp: {
          min: Number(mergedPressure?.clamp?.min ?? 0),
          max: Number(mergedPressure?.clamp?.max ?? 1),
        },
        curve: (() => {
          const t = mergedPressure?.curve?.type ?? "gamma";
          if (t === "gamma") {
            const gamma = Number(
              mergedPressure?.curve?.gamma ?? mergedPressure?.gamma ?? 1
            );
            return { type: "gamma", gamma };
          }
          return { type: "gamma", gamma: Number(mergedPressure?.gamma ?? 1) };
        })(),
        smoothing: (() => {
          const mode = mergedPressure?.smoothing?.mode ?? "oneEuro";
          if (mode === "oneEuro") {
            const oe = mergedPressure?.smoothing?.oneEuro || {};
            return {
              mode: "oneEuro",
              oneEuro: {
                minCutoff: Number(oe.minCutoff ?? 1.5),
                beta: Number(oe.beta ?? 0.03),
                dCutoff: Number(oe.dCutoff ?? 1.0),
              },
            };
          }
          return { mode: "disabled" };
        })(),
        velocityComp: mergedPressure?.velocityComp
          ? {
              k: Number(mergedPressure.velocityComp.k ?? 0.15),
              refSpeed: Number(mergedPressure.velocityComp.refSpeed ?? 1500),
            }
          : undefined,
        synth: (() => {
          const s = mergedPressure?.synth;
          if (!s || s.enabled === false) return { enabled: false };
          return {
            enabled: true,
            speedRange: [
              Number(s.speedRange?.[0] ?? 0),
              Number(s.speedRange?.[1] ?? 2000),
            ],
            minPressure: Number(s.minPressure ?? 0.15),
            maxPressure: Number(s.maxPressure ?? 1),
            curve: s.curve ?? "easeOut",
          };
        })(),
      },
      quality: {
        predictPx: Number(mergedQuality?.predictPx ?? 8),
        speedToSpacing: Number(mergedQuality?.speedToSpacing ?? 0.12),
        minStepPx: Number(mergedQuality?.minStepPx ?? 0.6),
      },
    };

    // Optional tags passthrough (array of strings). Safe if undefined.
    const tags = Array.isArray(b.tags)
      ? b.tags.map((t) => String(t)).filter(Boolean)
      : undefined;

    // id & category insertion
    const baseId = kebab(brushName);
    const id = ensureUniqueId(baseId, usedIds);

    const preset = {
      id,
      name: brushName,
      subtitle: subtitle || undefined,
      params,
      engine: {
        backend,
        strokePath,
        shape,
        grain,
        rendering,
        overrides: Object.keys(ov).length ? ov : undefined,
      },
      input,
      ...(tags ? { tags } : {}),
    };

    if (!categoryMap.has(cat.id))
      categoryMap.set(cat.id, { id: cat.id, name: cat.name, brushes: [] });
    categoryMap.get(cat.id).brushes.push(preset);
  }

  // sort categories by a friendly order
  const ORDER = [
    "sketching",
    "inking",
    "dry-media",
    "painting",
    "airbrushing",
    "textures",
    "abstract",
    "materials",
    "luminance",
  ];
  const categories = Array.from(categoryMap.values()).sort((a, b) => {
    const ia = ORDER.indexOf(a.id);
    const ib = ORDER.indexOf(b.id);
    if (ia === -1 && ib === -1) return a.name.localeCompare(b.name);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const ts = emitTS(categories);
  await fs.writeFile(OUT_TS, ts, "utf8");
  console.log(
    `✔ Wrote ${path.relative(process.cwd(), OUT_TS)} with ${categories.reduce((n, c) => n + c.brushes.length, 0)} brushes across ${categories.length} categories.`
  );
}

function guessShape(backend, name) {
  const s = String(name || "").toLowerCase();
  if (backend === "ribbon") {
    if (/chisel|baskerville/.test(s)) return "chisel";
    if (/nib|technical|gel|studio/.test(s)) return "nib";
    return "nib";
  }
  if (backend === "pattern") return "square";
  if (/charcoal|stick|bar/.test(s)) return "charcoal";
  if (/spray|air|dust/.test(s)) return "spray";
  return "oval";
}

/* ---------------------------- Emit TypeScript ---------------------------- */

function emitTS(categories) {
  // Self-contained helpers so the generated file compiles anywhere.
  const header = `// AUTO-GENERATED by scripts/convert-brushes.mjs — DO NOT EDIT BY HAND
// Source: src/data/brush-import/brush-presets-v1.json
import type { BrushCategory, BrushPreset, BrushParam, BrushParamType } from "@/data/brushPresets";
import type { EngineConfig } from "@/lib/brush/engine";

const p = (
  key: BrushParam["key"],
  label: string,
  type: BrushParamType,
  def: number,
  min = 0,
  max = 100,
  step = 1,
  show?: boolean
): BrushParam => ({
  key, label, type, defaultValue: def, min, max, step, ...(show === false ? { show } : {}),
});
`;

  const catBlocks = categories
    .map((cat) => {
      const brushBlocks = cat.brushes
        .map((brush) => {
          const params = brush.params
            .map(
              (pp) =>
                `p(${JSON.stringify(pp.key)}, ${JSON.stringify(pp.label)}, ${JSON.stringify(pp.type)}, ${pp.defaultValue}, ${pp.min ?? 0}, ${pp.max ?? 100}, ${pp.step ?? 1}${pp.show === false ? ", false" : ""})`
            )
            .join(",\n          ");

          const engine = brush.engine;
          const engineStr = `{
          backend: ${JSON.stringify(engine.backend)},
          strokePath: ${JSON.stringify(engine.strokePath)},
          shape: ${JSON.stringify(engine.shape)},
          grain: ${JSON.stringify(engine.grain)},
          rendering: ${JSON.stringify(engine.rendering)},
          ${engine.overrides ? `overrides: ${JSON.stringify(engine.overrides)},` : ""}
        }`;

          return `{
        id: ${JSON.stringify(brush.id)},
        name: ${JSON.stringify(brush.name)},
        ${brush.subtitle ? `subtitle: ${JSON.stringify(brush.subtitle)},` : ""}
        params: [
          ${params}
        ],
        engine: ${engineStr},
        input: ${JSON.stringify(brush.input)}${
          brush.tags
            ? `,
        tags: ${JSON.stringify(brush.tags)}`
            : ""
        }
      }`;
        })
        .join(",\n      ");

      return `{
    id: ${JSON.stringify(cat.id)},
    name: ${JSON.stringify(cat.name)},
    brushes: [
      ${brushBlocks}
    ]
  }`;
    })
    .join(",\n  ");

  const footer = `
export const BRUSH_CATEGORIES: BrushCategory[] = [
  ${catBlocks}
];

export const BRUSH_BY_ID: Record<string, BrushPreset> = Object.fromEntries(
  BRUSH_CATEGORIES.flatMap((c) => c.brushes.map((b) => [b.id, b]))
);
`;

  return header + "\nexport type __Keep = EngineConfig;\n\n" + footer;
}

/* ------------------------------ Run script ------------------------------ */

run().catch((err) => {
  console.error("Conversion failed:", err);
  process.exit(1);
});
