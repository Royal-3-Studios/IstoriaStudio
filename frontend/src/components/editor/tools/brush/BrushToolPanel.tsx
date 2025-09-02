// src/components/editor/tools/BrushToolPanel.tsx
"use client";
import * as React from "react";
import { useBrushManager } from "@/hooks/useBrushManager";
import { BRUSH_BY_ID } from "@/data/brushPresets";
import { BrushGallery } from "./BrushGallery";
import { BrushSettings } from "./BrushSettings";

export type BrushToolPanelProps = {
  // Color removed from here per your request
  onBrushEngineChangeAction?: (
    brushId: string,
    params: Record<string, number>
  ) => void;
  initialBrushId?: string;
  // If you keep previews elsewhere, you can pass a theme value for card BG later
};

type ParamsMap = Readonly<Record<string, number>>;
function shallowEqualParams(a: ParamsMap, b: ParamsMap) {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}

export default function BrushToolPanel({
  onBrushEngineChangeAction,
  initialBrushId = "pencil-2h",
}: BrushToolPanelProps) {
  const { state, preset, setBrushById, setParam, resetParams } =
    useBrushManager(initialBrushId);

  // Stable callback ref + change guard to avoid render loops
  const cbRef = React.useRef(onBrushEngineChangeAction);
  React.useEffect(() => {
    cbRef.current = onBrushEngineChangeAction;
  }, [onBrushEngineChangeAction]);

  const lastRef = React.useRef<{ id: string; params: ParamsMap } | null>(null);
  React.useEffect(() => {
    const current = { id: state.brushId, params: state.params };
    const prev = lastRef.current;
    if (
      !prev ||
      prev.id !== current.id ||
      !shallowEqualParams(prev.params, current.params)
    ) {
      lastRef.current = current;
      cbRef.current?.(current.id, current.params);
    }
  }, [state.brushId, state.params]);

  return (
    <div className="w-full">
      {/* md+: side-by-side (gallery 2 cols, settings 1 col); sm: stacked */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-2">
          <BrushGallery
            activeBrushId={state.brushId}
            onSelectAction={(id) => setBrushById(id)}
          />
        </div>
        <div>
          <BrushSettings
            preset={preset ?? BRUSH_BY_ID[state.brushId]}
            values={state.params}
            onChangeAction={setParam}
            onResetAction={resetParams}
          />
        </div>
      </div>
    </div>
  );
}
