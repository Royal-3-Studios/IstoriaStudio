// FILE: src/features/editor/canvas/Stage.tsx
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
  /**
   * Content nodes (images, text, boxes, etc.) go here.
   * Example usage:
   *   <Stage ...>
   *     <ImageClient ... />
   *     <TextClient ... />
   *     <RectClient ... />
   *   </Stage>
   */
  children?: React.ReactNode;
  /**
   * Optional overlay nodes that should NOT scale with zoom
   * (e.g., selection boxes, cursors, guides that live in screen space).
   */
  overlay?: React.ReactNode;
};

export default function Stage({
  width,
  height,
  bg = "white",
  zoom,
  className,
  children,
  overlay,
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
        {/* Background layer (scaled to document space) */}
        <LayerClient scaleX={safeZoom} scaleY={safeZoom}>
          <RectClient
            x={0}
            y={0}
            width={logicalW}
            height={logicalH}
            fill={bg === "white" ? "#fff" : "#000"}
            listening={false}
          />
        </LayerClient>

        {/* Content layer (scaled): put your image/text/box nodes here */}
        <LayerClient name="content" scaleX={safeZoom} scaleY={safeZoom}>
          {children /* ✅ replaces the old TODO */}
        </LayerClient>

        {/* Overlay layer (unscaled screen-space): selection, cursors, guides */}
        <LayerClient name="overlay">
          {overlay /* stays crisp regardless of zoom */}
        </LayerClient>
      </StageClient>
    </div>
  );
}
