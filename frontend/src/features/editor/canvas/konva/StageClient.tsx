// src/features/editor/canvas/konva/StageClient.tsx
"use client";

import dynamic from "next/dynamic";
import * as React from "react";
import type Konva from "konva";

// Client-only Stage (no SSR)
const StageImpl = dynamic(() => import("react-konva").then((m) => m.Stage), {
  ssr: false,
});

type ImplProps = React.ComponentProps<typeof StageImpl>;
type Props = Omit<ImplProps, "width" | "height"> & {
  width: number | undefined;
  height: number | undefined;
};

const StageClient = React.forwardRef<Konva.Stage, Props>(
  function StageClient(props, ref) {
    const { width, height, children, ...rest } = props;

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

    // Don't mount until we have non-zero size
    if (w <= 0 || h <= 0) return null;

    // Force remount on the first valid size
    const key = `${w}x${h}`;

    // IMPORTANT: don't forward a literal "ref" prop accidentally
    const { ref: _ignored, ...cleanRest } = rest as Record<string, unknown>;

    // Delay children until after Stage is attached to the scene
    const [showChildren, setShowChildren] = React.useState(false);
    React.useLayoutEffect(() => {
      setShowChildren(true);
      // if size changes later (new key), we’ll remount the Stage, so reset children then too:
      return () => setShowChildren(false);
    }, [key]);

    return (
      <StageImpl
        ref={ref}
        key={key}
        width={w}
        height={h}
        {...(cleanRest as ImplProps)}
      >
        {showChildren ? (children as React.ReactNode) : null}
      </StageImpl>
    );
  }
);

export default StageClient;
