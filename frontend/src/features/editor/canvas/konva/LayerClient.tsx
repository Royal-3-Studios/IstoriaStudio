// FILE: src/features/editor/canvas/konva/LayerClient.tsx
"use client";
import dynamic from "next/dynamic";
import * as React from "react";
import type Konva from "konva";
import { getAltitudeAzimuthFromPointer } from "@/lib/brush/core/input";
import type { NormalizedPointer } from "./StageClient"; // reuse the shared type

const LayerImpl = dynamic(() => import("react-konva").then((m) => m.Layer), {
  ssr: false,
});

type ImplProps = React.ComponentProps<typeof LayerImpl>;

type Props = ImplProps & {
  onPointerDownNorm?: (e: NormalizedPointer) => void;
  onPointerMoveNorm?: (e: NormalizedPointer) => void;
  onPointerUpNorm?: (e: NormalizedPointer) => void;
};

const LayerClient = React.forwardRef<Konva.Layer, Props>(
  function LayerClient(props, ref) {
    const { onPointerDownNorm, onPointerMoveNorm, onPointerUpNorm, ...rest } =
      props as Props;

    const layerRef = React.useRef<Konva.Layer | null>(null);
    React.useImperativeHandle(ref, () => layerRef.current as Konva.Layer, []);

    const toNorm = React.useCallback((evt: any): NormalizedPointer | null => {
      const pe: PointerEvent | undefined = evt?.evt;
      const stage = layerRef.current?.getStage() ?? null;
      if (!stage || !pe) return null;

      const pos = stage.getPointerPosition();
      if (!pos) return null;

      // Cross-browser stylus angles
      const { altitudeDeg, azimuthRad } = getAltitudeAzimuthFromPointer(pe);

      // Prefer event timestamp; fallback to perf.now()
      const t =
        typeof (pe as any).timeStamp === "number"
          ? (pe as any).timeStamp
          : performance.now();

      // Clamp pressure (PointerEvent.pressure is 0..1, but be safe)
      const pressure = Math.max(0, Math.min(1, pe.pressure ?? 1));

      // Build object; only include optionals when defined
      return {
        x: pos.x,
        y: pos.y,
        t,
        pressure,
        ...(altitudeDeg != null ? { altitudeDeg } : {}),
        ...(azimuthRad != null ? { azimuthRad } : {}),
        native: pe,
      };
    }, []);

    const handlePointerDown = (evt: any) => {
      (rest as any).onPointerDown?.(evt);
      const norm = toNorm(evt);
      if (norm && onPointerDownNorm) onPointerDownNorm(norm);
    };
    const handlePointerMove = (evt: any) => {
      (rest as any).onPointerMove?.(evt);
      const norm = toNorm(evt);
      if (norm && onPointerMoveNorm) onPointerMoveNorm(norm);
    };
    const handlePointerUp = (evt: any) => {
      (rest as any).onPointerUp?.(evt);
      const norm = toNorm(evt);
      if (norm && onPointerUpNorm) onPointerUpNorm(norm);
    };

    return (
      <LayerImpl
        ref={(node: Konva.Layer) => {
          layerRef.current = node ?? null;
          if (typeof ref === "function") ref(node);
          else if (ref && typeof ref === "object") (ref as any).current = node;
        }}
        onPointerDown={
          onPointerDownNorm ? handlePointerDown : (rest as any).onPointerDown
        }
        onPointerMove={
          onPointerMoveNorm ? handlePointerMove : (rest as any).onPointerMove
        }
        onPointerUp={
          onPointerUpNorm ? handlePointerUp : (rest as any).onPointerUp
        }
        {...(rest as ImplProps)}
      />
    );
  }
);

export default LayerClient;
