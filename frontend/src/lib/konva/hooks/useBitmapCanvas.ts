import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CanvasPool,
  withCanvas,
  type CanvasLike,
  type Ctx2D,
} from "../utils/canvasPool";

/** Draw in CSS space (0..width, 0..height). DPR is applied inside the hook. */
export type DrawFn = (canvas: CanvasLike, ctx: Ctx2D) => void | Promise<void>;

export type UseBitmapCanvasOptions = {
  width: number; // CSS px
  height: number; // CSS px
  dpr?: number; // default 1
  draw: DrawFn;
  deps?: ReadonlyArray<unknown>;
  pool?: CanvasPool;
};

type ImgSrc = CanvasImageSource | null;

export function useBitmapCanvas({
  width,
  height,
  dpr = 1,
  draw,
  deps = [],
  pool,
}: UseBitmapCanvasOptions): {
  image: ImgSrc;
  refresh: () => void;
  busy: boolean;
} {
  const localPool = useMemo(() => pool ?? new CanvasPool(8), [pool]);
  const [image, setImage] = useState<ImgSrc>(null);
  const [busy, setBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const disposeImage = useCallback((src: ImgSrc) => {
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
  }, []);

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
          // Reset transform then apply DPR so draw() uses CSS coords.
          const c2d = ctx as CanvasRenderingContext2D;
          if (typeof c2d.setTransform === "function") {
            c2d.setTransform(1, 0, 0, 1, 0, 0);
            c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
          }

          await draw(canvas, ctx);

          // Prefer ImageBitmap if available; otherwise snapshot to a standalone canvas.
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
            return snapshot as CanvasImageSource;
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
  }, [width, height, dpr, draw, localPool, disposeImage]);

  useEffect(() => {
    void renderOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderOnce, ...deps]);

  const refresh = useCallback(() => {
    void renderOnce();
  }, [renderOnce]);

  return { image, refresh, busy };
}

/* ---------------- Konva binder ---------------- */

export function useKonvaImageBinder(image: CanvasImageSource | null): (
  node: {
    image: (img: CanvasImageSource | null | undefined) => void;
    getLayer: () => { batchDraw: () => void } | null;
  } | null
) => void {
  return useCallback(
    (node) => {
      if (!node) return;
      node.image(image ?? undefined);
      node.getLayer?.()?.batchDraw?.();
    },
    [image]
  );
}
