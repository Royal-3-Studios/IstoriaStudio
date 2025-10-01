export type LoadedImage = {
  img: HTMLImageElement;
  /** Dispose resources (revokes object URLs if used). Safe to call multiple times. */
  dispose: () => void;
};

export type LoadImageOptions = {
  /** Set when loading cross-origin images you’ll draw to canvas. */
  crossOrigin?: "" | "anonymous" | "use-credentials";
  /** Forwarded to the underlying HTMLImageElement. */
  referrerPolicy?: ReferrerPolicy;
  /** Abort the load. */
  signal?: AbortSignal;
  /** Call HTMLImageElement.decode() when available for better paint timing. */
  decode?: boolean;
};

/** Load from a normal URL (no object URL to revoke). */
export function loadImageFromURL(
  url: string,
  opts: LoadImageOptions = {}
): Promise<LoadedImage> {
  return loadImageInternal({ src: url, revokeOnDispose: false }, opts);
}

/** Load from a Blob/File (creates an object URL and revokes it on dispose). */
export function loadImageFromBlob(
  blob: Blob,
  opts: LoadImageOptions = {}
): Promise<LoadedImage> {
  const objectUrl = URL.createObjectURL(blob);
  return loadImageInternal({ src: objectUrl, revokeOnDispose: true }, opts);
}

/* -------------------------------- internals -------------------------------- */

type SourceSpec = { src: string; revokeOnDispose: boolean };

function loadImageInternal(
  spec: SourceSpec,
  opts: LoadImageOptions
): Promise<LoadedImage> {
  const { crossOrigin, referrerPolicy, signal, decode = true } = opts;
  const img = new Image();

  if (typeof crossOrigin !== "undefined") img.crossOrigin = crossOrigin;
  if (typeof referrerPolicy !== "undefined")
    img.referrerPolicy = referrerPolicy;

  let settled = false;

  const cleanup = () => {
    img.onload = null;
    img.onerror = null;
    if (spec.revokeOnDispose) {
      try {
        URL.revokeObjectURL(spec.src);
      } catch {
        /* noop */
      }
    }
  };

  const dispose = () => {
    cleanup();
  };

  const promise = new Promise<LoadedImage>((resolve, reject) => {
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException("Image load aborted", "AbortError"));
    };

    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener("abort", onAbort, { once: true });
    }

    img.onload = async () => {
      if (settled) return;
      try {
        if (decode && "decode" in img && typeof img.decode === "function") {
          // decode() can throw if the image can't be decoded
          await img.decode();
        }
      } catch {
        // If decode fails, fall back to onload’d image anyway
      }
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      resolve({ img, dispose });
    };

    img.onerror = () => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      cleanup();
      reject(new Error(`Failed to load image: ${spec.src}`));
    };

    // Start loading last to ensure handlers are in place
    img.src = spec.src;
  });

  return promise;
}
