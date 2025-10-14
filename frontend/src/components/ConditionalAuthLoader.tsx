// src/components/ConditionalAuthLoader.tsx
"use client";
import dynamic from "next/dynamic";

export const ConditionalAuthLoader = dynamic(
  () => import("@/components/ConditionalAuth").then((m) => m.ConditionalAuth),
  { ssr: false, loading: () => null }
);
