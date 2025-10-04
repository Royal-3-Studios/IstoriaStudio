// src/components/editor/tools/options/BrushOptions.tsx
"use client";
import * as React from "react";
import BrushToolPanel from "@/components/editor/tools/brush/BrushToolPanel";
import type { ToolOptions } from "@/components/editor/types";

export default function BrushOptions({
  options,
  onChangeAction,
}: {
  options: Partial<ToolOptions>;
  onChangeAction: (patch: Partial<ToolOptions>) => void;
}) {
  const initialBrushId = options.brushId ?? "pencil-2h";

  const handleBrushEngineChangeAction = React.useCallback(
    (brushId: string, params: Record<string, number>) => {
      const patch: Partial<ToolOptions> = {
        brushId,
        ...(params.size != null ? { strokeWidth: params.size } : {}),
        ...(params.hardness != null ? { hardness: params.hardness } : {}),
        ...(params.flow != null ? { flow: params.flow } : {}),
        ...(params.spacing != null ? { spacing: params.spacing } : {}),
        ...(params.smoothing != null ? { smoothing: params.smoothing } : {}),
        ...(params.angle != null ? { angle: params.angle } : {}),
        // You can also store jitter/grain/opacity in options if your engine needs them:
        ...(params.jitterSize != null
          ? { jitterSize: params.jitterSize as unknown as number }
          : {}),
        ...(params.jitterAngle != null
          ? { jitterAngle: params.jitterAngle as unknown as number }
          : {}),
        ...(params.grain != null
          ? { grain: params.grain as unknown as number }
          : {}),
        ...(params.opacity != null ? { opacity: params.opacity } : {}),
      };
      onChangeAction(patch);
    },
    [onChangeAction]
  );

  return (
    <div className="flex flex-col gap-3">
      <BrushToolPanel
        initialBrushId={initialBrushId}
        onBrushEngineChangeAction={handleBrushEngineChangeAction}
      />
    </div>
  );
}
