// src/hooks/useBrushManager.ts
import { useMemo, useState, useCallback } from "react";
import { BRUSH_BY_ID, type BrushPreset } from "@/data/brushPresets";

export type BrushSettingsState = {
  brushId: string; // current brush
  params: Record<string, number>; // key -> value (size, flow, etc.)
};

function defaultsFromPreset(preset: BrushPreset): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of preset.params) out[p.key] = p.defaultValue;
  return out;
}

export function useBrushManager(initialBrushId: string) {
  const initialPreset =
    BRUSH_BY_ID[initialBrushId] ?? Object.values(BRUSH_BY_ID)[0];
  const [state, setState] = useState<BrushSettingsState>({
    brushId: initialPreset.id,
    params: defaultsFromPreset(initialPreset),
  });

  const preset = useMemo(() => BRUSH_BY_ID[state.brushId], [state.brushId]);

  const setBrushById = useCallback((id: string) => {
    const p = BRUSH_BY_ID[id];
    if (!p) return;
    setState({ brushId: id, params: defaultsFromPreset(p) });
  }, []);

  const setParam = useCallback((key: string, val: number) => {
    setState((s) => ({ ...s, params: { ...s.params, [key]: val } }));
  }, []);

  const resetParams = useCallback(() => {
    setState((s) => ({
      ...s,
      params: defaultsFromPreset(BRUSH_BY_ID[s.brushId]),
    }));
  }, []);

  return {
    state,
    preset,
    setBrushById,
    setParam,
    resetParams,
  };
}
