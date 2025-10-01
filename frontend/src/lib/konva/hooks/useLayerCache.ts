// FILE: src/lib/konva/hooks/useLayerCache.ts
import { useEffect, useRef, useCallback } from "react";
import type Konva from "konva";

type Options = {
  enabled: boolean;
  dpr: number; // devicePixelRatio for crisp cache
  drawBorder?: boolean; // Konva cache debug border
  maxRetries?: number; // default 8 frames
};

function getCacheRect(
  node: Konva.Node
): { x: number; y: number; width: number; height: number } | null {
  // If node exposes width/height functions (e.g., Rect, Image with explicit size)
  const maybeWidth = (node as unknown as { width?: () => number }).width;
  const maybeHeight = (node as unknown as { height?: () => number }).height;

  if (typeof maybeWidth === "function" && typeof maybeHeight === "function") {
    const w = maybeWidth.call(node);
    const h = maybeHeight.call(node);
    if (w > 0 && h > 0) return { x: 0, y: 0, width: w, height: h };
  }

  // Fallback: Groups/Layers/Transforms — rely on client rect
  const rect = node.getClientRect({ skipTransform: false });
  if (rect.width > 0 && rect.height > 0) {
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }
  return null;
}

export function useLayerCache<T extends Konva.Node>({
  enabled,
  dpr,
  drawBorder = false,
  maxRetries = 8,
}: Options) {
  const ref = useRef<T | null>(null);
  const lastNodeRef = useRef<Konva.Node | null>(null);
  const rafRef = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const node = lastNodeRef.current;
    if (node) {
      try {
        node.clearCache();
      } catch {
        // ignore
      }
    }
  }, []);

  const tryCache = useCallback(
    (node: Konva.Node, tries = 0) => {
      const rect = getCacheRect(node);
      if (!rect) {
        if (tries >= maxRetries) return;
        rafRef.current = requestAnimationFrame(() => tryCache(node, tries + 1));
        return;
      }
      // Clear previous cache when DPR toggles/changes
      try {
        node.clearCache();
      } catch {
        /* ignore */
      }
      try {
        // Supply explicit rect for Groups/Layers so Konva doesn't compute 0x0
        node.cache({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          pixelRatio: Math.max(1, dpr),
          drawBorder,
        });
      } catch {
        // If caching throws (rare), one more delayed retry can help
        if (tries < maxRetries) {
          rafRef.current = requestAnimationFrame(() =>
            tryCache(node, tries + 1)
          );
        }
      }
    },
    [dpr, drawBorder, maxRetries]
  );

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // If the node instance changed, clear old cache
    if (lastNodeRef.current && lastNodeRef.current !== node) {
      try {
        lastNodeRef.current.clearCache();
      } catch {
        /* ignore */
      }
    }
    lastNodeRef.current = node;

    if (enabled) {
      tryCache(node, 0);
    } else {
      clear();
    }

    // Clean up on unmount
    return () => {
      clear();
    };
  }, [enabled, tryCache, clear]);

  // For dynamic content that changes size (e.g., images load, children added),
  // you can expose a manual recache trigger:
  const recache = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    clear();
    if (enabled) tryCache(node, 0);
  }, [enabled, clear, tryCache]);

  return { ref, recache };
}
