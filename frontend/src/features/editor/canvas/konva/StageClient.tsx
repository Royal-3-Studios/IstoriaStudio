// FILE: src/features/editor/canvas/konva/StageClient.tsx
"use client";

import dynamic from "next/dynamic";
import * as React from "react";
import type Konva from "konva";
import { getAltitudeAzimuthFromPointer } from "@/lib/brush/core/input";

// Client-only Stage (no SSR)
const StageImpl = dynamic(() => import("react-konva").then((m) => m.Stage), {
  ssr: false,
});

export type NormalizedPointer = {
  x: number;
  y: number;
  t: number; // ms
  pressure: number; // 0..1
  altitudeDeg?: number; // 0..90
  azimuthRad?: number; // 0..2π
  native: PointerEvent;
};

type ImplProps = React.ComponentProps<typeof StageImpl>;
type OwnProps = {
  /** Normalized callbacks you can consume in your editor */
  onPointerDownNorm?: (p: NormalizedPointer) => void;
  onPointerMoveNorm?: (p: NormalizedPointer) => void;
  onPointerUpNorm?: () => void;
};

type Props = Omit<ImplProps, "width" | "height"> &
  OwnProps & {
    width: number | undefined;
    height: number | undefined;
  };

const StageClient = React.forwardRef<Konva.Stage, Props>(
  function StageClient(props, ref) {
    const {
      width,
      height,
      children,
      onPointerDownNorm,
      onPointerMoveNorm,
      onPointerUpNorm,
      // keep any user-provided raw handlers too
      onPointerDown,
      onPointerMove,
      onPointerUp,
      ...rest
    } = props;

    // Sanitize dimensions
    const w = React.useMemo(
      () =>
        Number.isFinite(width as number)
          ? Math.max(1, Math.floor(width as number))
          : 0,
      [width]
    );
    const h = React.useMemo(
      () =>
        Number.isFinite(height as number)
          ? Math.max(1, Math.floor(height as number))
          : 0,
      [height]
    );

    if (w <= 0 || h <= 0) return null;

    const key = `${w}x${h}`;
    const { ref: _ignored, ...cleanRest } = rest as Record<string, unknown>;

    const stageRef = React.useRef<Konva.Stage | null>(null);

    React.useImperativeHandle(ref, () => stageRef.current as Konva.Stage, []);

    // Delay children until after Stage is attached to the scene
    const [showChildren, setShowChildren] = React.useState(false);
    React.useLayoutEffect(() => {
      setShowChildren(true);
      return () => setShowChildren(false);
    }, [key]);

    // Normalizer — builds a NormalizedPointer using stage coords + native PointerEvent
    const toNorm = React.useCallback(
      (evt: Konva.KonvaEventObject<PointerEvent>): NormalizedPointer | null => {
        const st = stageRef.current;
        if (!st) return null;
        const pe = evt.evt;
        const pos = st.getPointerPosition();
        if (!pos) return null;

        const { altitudeDeg, azimuthRad } = getAltitudeAzimuthFromPointer(pe);
        const t =
          typeof (pe as any).timeStamp === "number"
            ? (pe as any).timeStamp
            : performance.now();
        const pressure = Math.max(0, Math.min(1, pe.pressure ?? 1));

        return {
          x: pos.x,
          y: pos.y,
          t,
          pressure,
          ...(altitudeDeg != null ? { altitudeDeg } : {}),
          ...(azimuthRad != null ? { azimuthRad } : {}),
          native: pe,
        };
      },
      []
    );

    // Wrap raw handlers so you can still receive Konva events
    const handlePointerDown = React.useCallback(
      (e: Konva.KonvaEventObject<PointerEvent>) => {
        if (onPointerDown) onPointerDown(e);
        if (onPointerDownNorm) {
          const norm = toNorm(e);
          if (norm) onPointerDownNorm(norm);
        }
      },
      [onPointerDown, onPointerDownNorm, toNorm]
    );

    const handlePointerMove = React.useCallback(
      (e: Konva.KonvaEventObject<PointerEvent>) => {
        if (onPointerMove) onPointerMove(e);
        if (onPointerMoveNorm) {
          const norm = toNorm(e);
          if (norm) onPointerMoveNorm(norm);
        }
      },
      [onPointerMove, onPointerMoveNorm, toNorm]
    );

    const handlePointerUp = React.useCallback(
      (e: Konva.KonvaEventObject<PointerEvent>) => {
        if (onPointerUp) onPointerUp(e);
        if (onPointerUpNorm) onPointerUpNorm();
      },
      [onPointerUp, onPointerUpNorm]
    );

    return (
      <StageImpl
        ref={stageRef}
        key={key}
        width={w}
        height={h}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        {...(cleanRest as ImplProps)}
      >
        {showChildren ? (children as React.ReactNode) : null}
      </StageImpl>
    );
  }
);

export default StageClient;
