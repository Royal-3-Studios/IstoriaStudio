// FILE: src/lib/konva/hooks/useBitmapCanvas.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CanvasPool,
  withCanvas,
  type CanvasLike,
  type Ctx2D,
} from "@/lib/konva/utils/canvasPool";

/** Draw in CSS space (0..width, 0..height). DPR transform is applied inside the hook. */
export type DrawFn = (canvas: CanvasLike, ctx: Ctx2D) => void | Promise<void>;

export type UseBitmapCanvasOptions = {
  /** CSS pixels */
  width: number;
  /** CSS pixels */
  height: number;
  /** Device pixel ratio used to scale the backing buffer. Defaults to 1. */
  dpr?: number;
  /** Drawing routine (awaited if it returns a Promise). */
  drawAction: DrawFn;
  /** Extra dependencies that should trigger a redraw (width/height/dpr are already tracked). */
  deps?: ReadonlyArray<unknown>;
  /** Optional shared pool. If omitted, a small internal pool is created. */
  pool?: CanvasPool;
};

export function useBitmapCanvas({
  width,
  height,
  dpr = 1,
  drawAction,
  deps = [],
  pool,
}: UseBitmapCanvasOptions): {
  image: ImageBitmap | HTMLCanvasElement | null;
  refresh: () => void;
  busy: boolean;
} {
  const localPool = useMemo(() => pool ?? new CanvasPool(8), [pool]);
  const [image, setImage] = useState<ImageBitmap | HTMLCanvasElement | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const disposeImage = useCallback(
    (src: ImageBitmap | HTMLCanvasElement | null) => {
      if (
        src &&
        typeof ImageBitmap !== "undefined" &&
        src instanceof ImageBitmap
      ) {
        try {
          src.close();
        } catch {
          /* noop */
        }
      }
    },
    []
  );

  useEffect(() => {
    return () => {
      disposeImage(image);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderOnce = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setBusy(true);
    try {
      const deviceW = Math.max(1, Math.floor(width * dpr));
      const deviceH = Math.max(1, Math.floor(height * dpr));

      const out = await withCanvas(
        localPool,
        deviceW,
        deviceH,
        async (canvas, ctx) => {
          // CSS-space drawing: reset then apply DPR transform
          const c2d = ctx as CanvasRenderingContext2D;
          if (typeof c2d.setTransform === "function") {
            c2d.setTransform(1, 0, 0, 1, 0, 0);
            c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
          }

          await drawAction(canvas, ctx);

          // Prefer ImageBitmap when available (more efficient), else snapshot to an HTMLCanvasElement
          if (typeof createImageBitmap === "function") {
            return await createImageBitmap(
              canvas as unknown as CanvasImageSource
            );
          } else {
            const snapshot = document.createElement("canvas");
            snapshot.width = deviceW;
            snapshot.height = deviceH;
            const sctx = snapshot.getContext("2d");
            sctx?.drawImage(canvas as unknown as CanvasImageSource, 0, 0);
            return snapshot;
          }
        },
        { allowLarger: true, clear: true }
      );

      if (ac.signal.aborted) {
        disposeImage(out);
        return;
      }

      setImage((prev) => {
        disposeImage(prev);
        return out;
      });
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setBusy(false);
    }
  }, [width, height, dpr, drawAction, localPool, disposeImage]);

  useEffect(() => {
    void renderOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderOnce, ...deps]);

  const refresh = useCallback(() => {
    void renderOnce();
  }, [renderOnce]);

  return { image, refresh, busy };
}

/* ---------------- Konva binder (optional) ---------------- */

export function useKonvaImageBinder(
  image: ImageBitmap | HTMLCanvasElement | null
): (
  node: {
    image: (img: CanvasImageSource | null | undefined) => void;
    getLayer: () => { batchDraw: () => void } | null;
  } | null
) => void {
  const latest = useRef<ImageBitmap | HTMLCanvasElement | null>(null);
  useEffect(() => {
    latest.current = image;
  }, [image]);

  return useCallback((node) => {
    if (!node) return;
    node.image((latest.current as unknown as CanvasImageSource) ?? undefined);
    node.getLayer?.()?.batchDraw?.();
  }, []);
}
