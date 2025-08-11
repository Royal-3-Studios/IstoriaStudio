// src/components/konva/LayerClient.tsx
"use client";
import { Layer as RLayer } from "react-konva";
import type React from "react";

export default function LayerClient(
  props: React.ComponentProps<typeof RLayer>
) {
  return <RLayer {...props} />;
}
