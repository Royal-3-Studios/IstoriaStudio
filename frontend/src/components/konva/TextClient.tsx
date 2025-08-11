// src/components/konva/TextClient.tsx
"use client";
import { Text as RText } from "react-konva";
import type React from "react";

export default function TextClient(props: React.ComponentProps<typeof RText>) {
  return <RText {...props} />;
}
