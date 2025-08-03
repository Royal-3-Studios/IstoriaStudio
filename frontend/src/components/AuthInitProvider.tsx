"use client";

import { useAuthInit } from "@/hooks/useAuthInit";

export function AuthInitProvider() {
  useAuthInit();
  return null;
}
