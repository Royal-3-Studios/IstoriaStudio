// src/features/editor/canvas/konva/LayerClient.tsx
"use client";
import dynamic from "next/dynamic";
import * as React from "react";
import type Konva from "konva";

const LayerImpl = dynamic(() => import("react-konva").then((m) => m.Layer), {
  ssr: false,
});

type ImplProps = React.ComponentProps<typeof LayerImpl>;

const LayerClient = React.forwardRef<Konva.Layer, ImplProps>(
  function LayerClient(props, ref) {
    const { ref: _ignored, ...rest } = props as Record<string, unknown>;
    return <LayerImpl ref={ref} {...(rest as ImplProps)} />;
  }
);

export default LayerClient;
