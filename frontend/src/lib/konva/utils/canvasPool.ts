// FILE: src/lib/konva/utils/canvasPool.ts

/**
 * Tiny pool for (Offscreen|HTML) canvases to reduce churn/GC.
 * - Works in both main thread and worker.
 * - Strict TypeScript (no `any`, `noUncheckedIndexedAccess` safe).
 */

export type CanvasLike = HTMLCanvasElement | OffscreenCanvas;
export type Ctx2D =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export type RentOptions = {
  /** If true, find a canvas with *at least* the size; otherwise exact. Default: true */
  allowLarger?: boolean;
  /** If true, the canvas is cleared before returned. Default: true */
  clear?: boolean;
};

export type PoolStats = {
  free: number;
  busy: number;
  total: number;
};

type PooledCanvas = {
  canvas: CanvasLike;
  width: number; // device pixels
  height: number; // device pixels
  busy: boolean;
};

/* ─────────────────────────── Environment helpers ─────────────────────────── */

function supportsOffscreen(): boolean {
  return typeof OffscreenCanvas !== "undefined";
}

function createCanvas(width: number, height: number): CanvasLike {
  if (supportsOffscreen()) return new OffscreenCanvas(width, height);
  // In workers `document` is undefined; this branch only runs when DOM exists.
  const el = document.createElement("canvas");
  el.width = width;
  el.height = height;
  return el;
}

/** Structural guard for 2D contexts across HTML and Offscreen implementations. */
function isCtx2D(ctx: unknown): ctx is Ctx2D {
  if (!ctx || typeof ctx !== "object") return false;
  const c = ctx as Partial<CanvasRenderingContext2D>;
  return (
    typeof c.clearRect === "function" &&
    typeof c.drawImage === "function" &&
    typeof c.getImageData === "function"
  );
}

/** Get a 2D context or throw (keeps call sites simple). */
export function get2D(target: CanvasLike): Ctx2D {
  const ctx = (target as HTMLCanvasElement | OffscreenCanvas).getContext("2d", {
    alpha: true,
  });
  if (!isCtx2D(ctx)) {
    throw new Error("2D context unavailable.");
  }
  return ctx;
}

/** Ensure device-pixel size; does not set CSS size (callers control that). */
function ensureDeviceSize(c: CanvasLike, w: number, h: number): void {
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
}

/** Index helper for arrays under `noUncheckedIndexedAccess` once bounds are proven. */
function atStrict<T>(arr: T[], idx: number): T {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return arr[idx]!;
}

/* ────────────────────────────────── Pool ─────────────────────────────────── */

export class CanvasPool {
  private items: PooledCanvas[] = [];
  private maxFree: number;

  constructor(maxFree: number = 16) {
    this.maxFree = Math.max(0, Math.floor(maxFree));
  }

  stats(): PoolStats {
    const total = this.items.length;
    let busy = 0;
    for (let i = 0; i < total; i++) {
      const it = this.items[i];
      if (it && it.busy) busy++;
    }
    return { free: total - busy, busy, total };
  }

  /** Rent a canvas in *device pixels*. */
  rent(
    width: number,
    height: number,
    opts: RentOptions = { allowLarger: true, clear: true }
  ): { canvas: CanvasLike; release: () => void } {
    const reqW = Math.max(1, Math.floor(width));
    const reqH = Math.max(1, Math.floor(height));
    const allowLarger = opts.allowLarger ?? true;
    const clearBeforeUse = opts.clear ?? true;

    // Find an idle canvas that fits the request
    let foundIndex = -1;
    for (let i = 0; i < this.items.length; i++) {
      const candidate = this.items[i];
      if (!candidate || candidate.busy) continue;

      const sizeOk = allowLarger
        ? candidate.width >= reqW && candidate.height >= reqH
        : candidate.width === reqW && candidate.height === reqH;

      if (sizeOk) {
        foundIndex = i;
        break;
      }
    }

    let pooled: PooledCanvas;

    if (foundIndex >= 0) {
      pooled = atStrict(this.items, foundIndex);
      // Grow (never shrink) to avoid resize churn
      const newW = Math.max(pooled.width, reqW);
      const newH = Math.max(pooled.height, reqH);
      if (newW !== pooled.width || newH !== pooled.height) {
        ensureDeviceSize(pooled.canvas, newW, newH);
        pooled.width = newW;
        pooled.height = newH;
      }
    } else {
      const canvas = createCanvas(reqW, reqH);
      pooled = { canvas, width: reqW, height: reqH, busy: false };
      this.items.push(pooled);
    }

    pooled.busy = true;

    if (clearBeforeUse) {
      const ctx = get2D(pooled.canvas);
      // Reset transform (when available) and clear in device pixels
      if (
        typeof (ctx as CanvasRenderingContext2D).setTransform === "function"
      ) {
        (ctx as CanvasRenderingContext2D).setTransform(1, 0, 0, 1, 0, 0);
      }
      ctx.clearRect(0, 0, pooled.canvas.width, pooled.canvas.height);
    }

    const release = (): void => {
      pooled.busy = false;
      this.trim(); // lazily enforce cap
    };

    return { canvas: pooled.canvas, release };
  }

  /** Free all canvases immediately. */
  disposeAll(): void {
    this.items.length = 0;
  }

  /** Reduce free canvases to the maxFree cap (keep the largest ones). */
  trim(): void {
    if (this.maxFree < 0) return;

    const busy: PooledCanvas[] = [];
    const free: PooledCanvas[] = [];

    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (!it) continue;
      (it.busy ? busy : free).push(it);
    }

    // Keep the largest free canvases (by area)
    free.sort((a, b) => b.width * b.height - a.width * a.height);

    const kept = free.slice(0, this.maxFree);
    // const dropped = free.slice(this.maxFree); // allow GC naturally

    this.items = busy.concat(kept);
  }

  setMaxFree(n: number): void {
    this.maxFree = Math.max(0, Math.floor(n));
    this.trim();
  }
}

/* ──────────────────────────────── Helpers ───────────────────────────────── */

export async function withCanvas<T>(
  pool: CanvasPool,
  width: number,
  height: number,
  fn: (canvas: CanvasLike, ctx: Ctx2D) => Promise<T> | T,
  opts?: RentOptions
): Promise<T> {
  const { canvas, release } = pool.rent(width, height, opts);
  try {
    const ctx = get2D(canvas);
    return await fn(canvas, ctx);
  } finally {
    release();
  }
}

/**
 * Create a snapshot ImageBitmap from a canvas (clone, not transfer).
 * The resulting ImageBitmap can be transferred by the caller if needed.
 */
export async function snapshotBitmap(canvas: CanvasLike): Promise<ImageBitmap> {
  // Works for both HTMLCanvasElement and OffscreenCanvas
  return await createImageBitmap(canvas as unknown as CanvasImageSource);
}
