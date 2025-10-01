// src/features/editor/canvas/Stage.tsx
"use client";

import * as React from "react";
import StageClient from "./konva/StageClient";
import LayerClient from "./konva/LayerClient";
import RectClient from "./konva/RectClient";
import { useEditorStore } from "../store/editor.store";

type Props = {
  width: number;
  height: number;
  bg?: "white" | "black";
  /** 1 = 100% zoom; if omitted, uses store zoom */
  zoom?: number;
  className?: string;
};

export default function Stage({
  width,
  height,
  bg = "white",
  zoom,
  className,
}: Props): React.ReactElement {
  // Always call the store; prefer the prop if provided.
  const storeZoom = useEditorStore((s) => s.viewport.zoom);
  const effectiveZoom = typeof zoom === "number" ? zoom : storeZoom;

  const safeZoom = Math.max(0.0001, effectiveZoom);
  const logicalW = width / safeZoom;
  const logicalH = height / safeZoom;

  return (
    <div className={className ?? ""}>
      <StageClient width={width} height={height}>
        <LayerClient scaleX={safeZoom} scaleY={safeZoom}>
          <RectClient
            x={0}
            y={0}
            width={logicalW}
            height={logicalH}
            fill={bg === "white" ? "#fff" : "#000"}
            listening={false}
          />
          {/* TODO: add your image/text/box layers here */}
        </LayerClient>
      </StageClient>
    </div>
  );
}
