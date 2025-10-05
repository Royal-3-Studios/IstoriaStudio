// FILE: src/lib/konva/utils/useBitmapCanvas.ts

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CanvasPool,
  withCanvas,
  type CanvasLike,
  type Ctx2D,
} from "../utils/canvasPool";
// FILE: src/lib/konva/utils/useKonvaImage.ts
export {
  useBitmapCanvas as useKonvaImage,
  useKonvaImageBinder,
  type UseBitmapCanvasOptions as UseKonvaImageOptions,
} from "./useBitmapCanvas";

/**
 * Function that draws into the provided canvas (CSS space; DPR already handled by caller if desired).
 * Return a Promise to perform async work; the hook will await it.
 */
export type DrawFn = (canvas: CanvasLike, ctx: Ctx2D) => void | Promise<void>;

export type UseBitmapCanvasOptions = {
  /** CSS pixels */
  width: number;
  /** CSS pixels */
  height: number;
  /**
   * Device pixel ratio for rasterization (multiplies width/height for the backing buffer).
   * Defaults to 1.
   */
  dpr?: number;
  /**
   * Drawing routine. Called every time `refresh()` runs or when dependencies change.
   * Draw in CSS space (0..width, 0..height). The hook will size the backing canvas to width*dpr × height*dpr.
   */
  draw: DrawFn;
  /**
   * Changes to these dependencies will automatically trigger a redraw.
   * (The width/height/dpr props are tracked separately and do not need to be duplicated here.)
   */
  deps?: ReadonlyArray<unknown>;
  /**
   * Optional shared pool. If omitted, the hook will create a small internal pool.
   */
  pool?: CanvasPool;
};

/**
 * React hook that renders into a pooled canvas and exposes an ImageBitmap for Konva.
 * - Uses transferable-ready ImageBitmap (remember to call `.close()` when you no longer need it).
 * - Cleans up previous bitmaps to avoid GPU memory leaks.
 * - No `any` used; fully typed.
 */
export function useBitmapCanvas({
  width,
  height,
  dpr = 1,
  draw,
  deps = [],
  pool,
}: UseBitmapCanvasOptions): {
  image: ImageBitmap | null;
  refresh: () => void;
  busy: boolean;
} {
  const localPool = useMemo(() => pool ?? new CanvasPool(8), [pool]);
  const [image, setImage] = useState<ImageBitmap | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  // keep a handle to cancel in-flight work when deps change/unmount
  const abortRef = useRef<AbortController | null>(null);

  const disposeImage = useCallback((bmp: ImageBitmap | null) => {
    try {
      bmp?.close(); // idempotent; releases GPU memory
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    return () => {
      // unmount cleanup
      disposeImage(image);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once

  const renderOnce = useCallback(async () => {
    // cancel previous task if still running
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setBusy(true);
    try {
      const deviceW = Math.max(1, Math.floor(width * dpr));
      const deviceH = Math.max(1, Math.floor(height * dpr));

      // rent, draw, snapshot
      const bmp = await withCanvas(
        localPool,
        deviceW,
        deviceH,
        async (canvas, ctx) => {
          // draw in CSS space: set DPR transform
          if (
            typeof (ctx as CanvasRenderingContext2D).setTransform === "function"
          ) {
            (ctx as CanvasRenderingContext2D).setTransform(
              dpr,
              0,
              0,
              dpr,
              0,
              0
            );
          }
          await draw(canvas, ctx);
          // Snapshot after drawing
          return await createImageBitmap(
            canvas as unknown as CanvasImageSource
          );
        },
        { allowLarger: true, clear: true }
      );

      if (ac.signal.aborted) {
        // if aborted after work finished, release the produced bitmap
        disposeImage(bmp);
        return;
      }

      // swap bitmaps (dispose previous to free memory)
      setImage((prev) => {
        disposeImage(prev);
        return bmp;
      });
    } finally {
      if (abortRef.current === ac) {
        abortRef.current = null;
      }
      setBusy(false);
    }
  }, [width, height, dpr, draw, localPool, disposeImage]);

  // auto-render on input changes
  useEffect(() => {
    void renderOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderOnce, ...deps]);

  const refresh = useCallback(() => {
    void renderOnce();
  }, [renderOnce]);

  return { image, refresh, busy };
}

/* ------------------------------------------------------------------ */
/* Konva helper (optional): ref binder                                */
/* ------------------------------------------------------------------ */

/**
 * Given the ImageBitmap from `useBitmapCanvas`, returns a stable ref-callback
 * that you can pass to a `<KonvaImage ref={refCb} />` or set the `image` prop manually.
 *
 * Usage with react-konva:
 *   const { image } = useBitmapCanvas(...);
 *   const bindImage = useKonvaImageBinder(image);
 *   <Image ref={bindImage} image={image as unknown as CanvasImageSource} />
 */
