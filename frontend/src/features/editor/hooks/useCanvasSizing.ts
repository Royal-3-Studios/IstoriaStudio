// src/app/projects/[projectId]/hooks/useCanvasSizing.tsx

"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export function useCanvasSizing(
  frameW: number,
  frameH: number,
  previewCapLongEdge = 1600
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    let raf = 0;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setContainer({
        w: Math.max(0, r.width - 8),
        h: Math.max(0, r.height - 8),
      });
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    window.addEventListener("resize", schedule);
    measure();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(raf);
    };
  }, []);

  const fitToContainerScale = useMemo(() => {
    if (!container.w || !container.h || !frameW || !frameH) return 1;
    return Math.min(container.w / frameW, container.h / frameH);
  }, [container.w, container.h, frameW, frameH]);

  const previewCapScale = useMemo(() => {
    const longest = Math.max(frameW || 0, frameH || 0);
    if (!longest) return 1;
    return Math.min(1, previewCapLongEdge / longest);
  }, [frameW, frameH, previewCapLongEdge]);

  return { containerRef, fitToContainerScale, previewCapScale };
}
