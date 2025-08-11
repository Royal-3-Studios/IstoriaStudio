// src/components/konva/ImageClient.tsx
"use client";
import { Image as RImage } from "react-konva";
import type React from "react";

export default function ImageClient(
  props: React.ComponentProps<typeof RImage>
) {
  return <RImage {...props} />;
}
