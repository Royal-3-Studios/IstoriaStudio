// src/components/konva/StageClient.tsx
"use client";
import { Stage as RStage } from "react-konva";
import type React from "react";

export default function StageClient(
  props: React.ComponentProps<typeof RStage>
) {
  return <RStage {...props} />;
}
