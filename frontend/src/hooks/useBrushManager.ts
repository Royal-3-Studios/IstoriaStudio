// src/hooks/useBrushManager.ts
import { useMemo, useState, useCallback } from "react";
import { BRUSH_BY_ID, type BrushPreset } from "@/data/brushPresets";

export type BrushSettingsState = {
  brushId: string; // current brush id
  params: Record<string, number>; // key -> value (size, flow, etc.)
};

function defaultsFromPreset(
  preset: BrushPreset | undefined
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!preset) return out;
  for (const p of preset.params) out[p.key] = p.defaultValue;
  return out;
}

/** Local minimal fallback so we never crash if catalog is empty or an id is missing. */
const LOCAL_FALLBACK_PRESET: BrushPreset = {
  id: "fallback",
  name: "Fallback Brush",
  params: [
    {
      key: "size",
      label: "Size",
      type: "size",
      defaultValue: 12,
      min: 1,
      max: 120,
      step: 1,
    },
    {
      key: "flow",
      label: "Flow",
      type: "flow",
      defaultValue: 100,
      min: 0,
      max: 100,
      step: 1,
    },
    {
      key: "smoothing",
      label: "Smoothing",
      type: "smoothing",
      defaultValue: 24,
      min: 0,
      max: 100,
      step: 1,
    },
    {
      key: "spacing",
      label: "Spacing",
      type: "spacing",
      defaultValue: 4,
      min: 0,
      max: 100,
      step: 1,
    },
  ],
  engine: {
    backend: "stamping",
    strokePath: { spacing: 4, jitter: 0, scatter: 0, streamline: 24, count: 1 },
    shape: { type: "round", softness: 50, sizeScale: 1 },
    grain: { kind: "none", depth: 0, scale: 1 },
    rendering: { mode: "marker", wetEdges: false, flow: 100 },
  },
};

export function useBrushManager(initialBrushId: string) {
  // Resolve a stable “first catalog” preset once
  const firstCatalogPreset = useMemo<BrushPreset | undefined>(() => {
    const all = Object.values(BRUSH_BY_ID);
    return all.length ? all[0] : undefined;
  }, []);

  // Choose a safe initial preset
  const initialPreset = useMemo<BrushPreset>(() => {
    const byId = BRUSH_BY_ID[initialBrushId];
    return byId ?? firstCatalogPreset ?? LOCAL_FALLBACK_PRESET;
  }, [initialBrushId, firstCatalogPreset]);

  const [state, setState] = useState<BrushSettingsState>(() => ({
    brushId: initialPreset.id,
    params: defaultsFromPreset(initialPreset),
  }));

  // Always resolve the current preset from the catalog (with a local fallback)
  const preset = useMemo<BrushPreset>(() => {
    return (
      BRUSH_BY_ID[state.brushId] ?? firstCatalogPreset ?? LOCAL_FALLBACK_PRESET
    );
  }, [state.brushId, firstCatalogPreset]);

  const setBrushById = useCallback(
    (id: string) => {
      const p = BRUSH_BY_ID[id] ?? firstCatalogPreset ?? LOCAL_FALLBACK_PRESET;
      setState({ brushId: p.id, params: defaultsFromPreset(p) });
    },
    [firstCatalogPreset]
  );

  const setParam = useCallback((key: string, val: number) => {
    setState((s) => ({ ...s, params: { ...s.params, [key]: val } }));
  }, []);

  const resetParams = useCallback(() => {
    setState((s) => {
      const p =
        BRUSH_BY_ID[s.brushId] ?? firstCatalogPreset ?? LOCAL_FALLBACK_PRESET;
      return { ...s, params: defaultsFromPreset(p) };
    });
  }, [firstCatalogPreset]);

  return {
    state,
    preset,
    setBrushById,
    setParam,
    resetParams,
  };
}
