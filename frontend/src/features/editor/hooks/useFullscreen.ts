// src/app/projects/[projectId]/editor/hooks/useFullscreen.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useFullscreen<T extends HTMLElement>() {
  const targetRef = useRef<T | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const sync = useCallback(() => {
    const fsEl = document.fullscreenElement;
    if (targetRef.current) {
      setIsFullscreen(!!fsEl && fsEl === targetRef.current);
    } else {
      setIsFullscreen(!!fsEl);
    }
  }, []);

  useEffect(() => {
    const onChange = () => sync();
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [sync]);

  const enter = useCallback(async () => {
    const el = targetRef.current ?? document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      await el.requestFullscreen();
    }
  }, []);

  const exit = useCallback(async () => {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
  }, []);

  const toggle = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      const el = targetRef.current ?? document.documentElement;
      await el.requestFullscreen();
    }
  }, []);

  return { targetRef, isFullscreen, enter, exit, toggle };
}
