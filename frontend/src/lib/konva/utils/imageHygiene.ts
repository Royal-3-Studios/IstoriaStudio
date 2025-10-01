// FILE: src/lib/konva/utils/imageHygiene.ts

/**
 * Utilities to avoid leaking ImageBitmaps, HTMLImageElements,
 * and blob/object URLs when used with Konva.Image.
 */

type Revoker = () => void;

/* ------------------------------------------------------------------ */
/* Core URL helpers                                                    */
/* ------------------------------------------------------------------ */

function revokeObjectURLSafe(url: string): void {
  if (
    typeof URL !== "undefined" &&
    typeof URL.revokeObjectURL === "function" &&
    url.startsWith("blob:")
  ) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  }
}

/** Public: revoke a previously created object URL (no-op for data: URLs). */
export function revokeObjectUrl(url: string): void {
  revokeObjectURLSafe(url);
}

/** Heuristic: is this likely a blob/object URL? */
export function isLikelyObjectUrl(url: string): boolean {
  return url.startsWith("blob:");
}

/* ------------------------------------------------------------------ */
/* ImageBitmap lifecycle                                               */
/* ------------------------------------------------------------------ */

/** Safely close an ImageBitmap (no-op if null/undefined). */
export function disposeBitmap(bmp: ImageBitmap | null | undefined): void {
  if (!bmp) return;
  try {
    bmp.close();
  } catch {
    /* ignore */
  }
}

/** Alias used by hooks for clarity. */
export function safeDisposeBitmap(bmp: ImageBitmap | null | undefined): void {
  disposeBitmap(bmp);
}

/**
 * Convert an ImageBitmap to an HTMLCanvasElement (caller owns the canvas).
 */
export function bitmapToCanvas(bmp: ImageBitmap): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) {
    throw new Error(
      "2D context unavailable while converting bitmap to canvas."
    );
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0);

  return canvas;
}

/**
 * Create a URL string for an ImageBitmap.
 *
 * Note: For synchronous use in React hooks, this returns a **data: URL**
 * (fast and revocation-free). If you specifically need a blob/object URL
 * for streaming or very large images, add an async path that uses
 * `canvas.toBlob()` / `OffscreenCanvas.convertToBlob()` in your caller.
 */
export function createObjectUrlFromBitmap(bmp: ImageBitmap): string {
  const canvas = bitmapToCanvas(bmp);
  // Synchronous, avoids async toBlob; fine for previews/Konva images.
  // Produces a data: URL, which does not require URL.revokeObjectURL.
  return canvas.toDataURL("image/png");
}

/* ------------------------------------------------------------------ */
/* HTMLImageElement hygiene                                            */
/* ------------------------------------------------------------------ */

/**
 * Arrange for an object URL to be revoked exactly once after the given
 * HTMLImageElement either loads or errors.
 *
 * Returns a disposer that removes listeners and revokes if not yet revoked.
 */
export function revokeObjectUrlOnImage(
  image: HTMLImageElement,
  objectUrl: string
): { dispose: Revoker } {
  let done = false;

  const cleanup = (): void => {
    if (!done) {
      done = true;
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
      revokeObjectURLSafe(objectUrl);
    }
  };

  const onLoad = (): void => cleanup();
  const onError = (): void => cleanup();

  image.addEventListener("load", onLoad, { once: true });
  image.addEventListener("error", onError, { once: true });

  return { dispose: cleanup };
}

/**
 * Best-effort cleanup for an HTMLImageElement.
 * Clears events and src/srcset/sizes to release references.
 */
export function disposeHTMLImage(img: HTMLImageElement): void {
  img.onload = null;
  img.onerror = null;

  const currentSrc: string | null =
    typeof img.src === "string" ? img.src : null;
  const looksLikeBlob = currentSrc !== null && isLikelyObjectUrl(currentSrc);

  try {
    img.decoding = "auto";
    img.src = "";
    if (typeof img.srcset === "string") img.srcset = "";
    if (typeof img.sizes === "string") img.sizes = "";
  } catch {
    /* ignore */
  }

  if (looksLikeBlob && currentSrc) {
    revokeObjectURLSafe(currentSrc);
  }
}
