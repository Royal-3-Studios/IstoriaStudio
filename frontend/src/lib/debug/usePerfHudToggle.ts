// FILE: src/lib/debug/usePerfHudToggle.ts
"use client";

import { useEffect } from "react";
import { perfHudStore } from "./hud";

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPod|iPad/.test(navigator.platform);
}

export function usePerfHudToggle(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const metaOk = isMac() ? e.metaKey : e.ctrlKey;
      if (metaOk && e.shiftKey && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        perfHudStore.getState().toggleVisible();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
