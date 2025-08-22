// src/components/ui/AspectBox.tsx
"use client";
import React from "react";

export default function AspectBox({
  width,
  height,
  className = "",
  children,
}: {
  width: number;
  height: number;
  className?: string;
  children?: React.ReactNode;
}) {
  // Avoid div-by-zero
  const ratio = height > 0 ? (height / width) * 100 : 100;

  return (
    <div className={`relative w-full ${className}`}>
      {/* intrinsic ratio box */}
      <div style={{ paddingTop: `${ratio}%` }} />
      {/* content centered within */}
      <div className="absolute inset-0 grid place-items-center overflow-hidden">
        {children}
      </div>
    </div>
  );
}
