"use client";
import { useBrushManager } from "@/hooks/useBrushManager";
import { BRUSH_BY_ID } from "@/data/brushPresets";
import { BrushLibrary } from "./BrushLibrary";
import { BrushSettings } from "./BrushSettings";
import ColorPanel from "../ColorPanel";
import { useEffect } from "react";

export type BrushToolPanelProps = {
  // bridge to your canvas/tool system:
  stroke: string;
  alpha: number; // 0..100
  onColorChangeAction: (strokeHex: string, alpha: number) => void;

  // when brush core params change, notify the engine
  onBrushEngineChange?: (
    brushId: string,
    params: Record<string, number>
  ) => void;

  initialBrushId?: string; // e.g. "pencil2h"
};

export default function BrushToolPanel({
  stroke,
  alpha,
  onColorChangeAction,
  onBrushEngineChange,
  initialBrushId = "pencil2h",
}: BrushToolPanelProps) {
  const { state, preset, setBrushById, setParam, resetParams } =
    useBrushManager(initialBrushId);

  // push changes up to engine when anything relevant changes
  // (you can debounce if needed)
  useEffect(() => {
    onBrushEngineChange?.(state.brushId, state.params);
  }, [state, onBrushEngineChange]);

  return (
    <div className="flex flex-col gap-3">
      {/* 1) Color (reusable for other tools later) */}
      <ColorPanel
        value={stroke}
        alpha={alpha}
        onChangeAction={onColorChangeAction}
      />

      {/* 2) Library (categories -> brushes) */}
      <BrushLibrary
        activeBrushId={state.brushId}
        onSelectAction={(id) => setBrushById(id)}
      />

      {/* 3) Dynamic settings for the selected brush */}
      <BrushSettings
        preset={preset ?? BRUSH_BY_ID[state.brushId]}
        values={state.params}
        onChangeAction={setParam}
        onResetAction={resetParams}
      />
    </div>
  );
}
