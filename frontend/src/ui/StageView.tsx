// FILE: src/ui/StageView.tsx
"use client";

import { useEffect, useMemo } from "react";
import { Stage, Layer } from "react-konva";
import type Konva from "konva";
import PaintLayer from "./PaintLayer";
import ReferenceLayer from "./ReferenceLayer";
import { useLayerCache } from "@/lib/konva/hooks/useLayerCache";

export type DrawPaint = (
  canvas: OffscreenCanvas | HTMLCanvasElement,
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
) => void | Promise<void>;

export type StageViewProps = {
  width: number; // CSS px (logical canvas size)
  height: number; // CSS px
  dpr?: number; // default: window.devicePixelRatio
  zoom?: number; // stage visual scale
  pan?: { x: number; y: number };
  drawPaintAction: DrawPaint;
};

export default function StageView({
  width,
  height,
  dpr = typeof window !== "undefined" ? window.devicePixelRatio ?? 1 : 1,
  zoom = 1,
  pan = { x: 0, y: 0 },
  drawPaintAction,
}: StageViewProps) {
  // Cache the reference overlay (guides, rulers, etc.)
  const { ref: refLayerRef, recache: recacheRefLayer } =
    useLayerCache<Konva.Layer>({ enabled: true, dpr });

  // Usually keep paint layer uncached (it changes often). Flip enabled to true
  // if your paint bitmap is static between frames and you want cached blits.
  const { ref: paintLayerRef } = useLayerCache<Konva.Layer>({
    enabled: false,
    dpr,
  });

  // Re-cache the reference layer when view transforms or size change
  useEffect(() => {
    recacheRefLayer();
  }, [recacheRefLayer, width, height, zoom, pan.x, pan.y]);

  const stageScale = useMemo(() => zoom, [zoom]);
  const stageX = useMemo(() => pan.x, [pan.x]);
  const stageY = useMemo(() => pan.y, [pan.y]);

  return (
    <Stage
      width={width}
      height={height}
      scaleX={stageScale}
      scaleY={stageScale}
      x={stageX}
      y={stageY}
      // Optional perf flags:
      // perfectDrawEnabled={false}
      // listening={false} // if you don’t need pointer events at stage level
    >
      <Layer ref={paintLayerRef} listening={false}>
        <PaintLayer
          width={width}
          height={height}
          dpr={dpr}
          drawPaint={drawPaintAction}
        />
      </Layer>

      <Layer ref={refLayerRef} listening={false}>
        <ReferenceLayer width={width} height={height} dpr={dpr} />
      </Layer>
    </Stage>
  );
}
