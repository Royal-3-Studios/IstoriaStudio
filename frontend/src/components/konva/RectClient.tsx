// src/components/konva/RectClient.tsx
"use client";
import { Rect as RRect } from "react-konva";
import type React from "react";

export default function RectClient(props: React.ComponentProps<typeof RRect>) {
  return <RRect {...props} />;
}
