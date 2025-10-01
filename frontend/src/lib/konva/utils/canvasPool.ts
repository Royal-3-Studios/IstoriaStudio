// FILE: src/lib/konva/utils/canvasPool.ts

/**
 * Tiny pool for (Offscreen|HTML) canvases to reduce churn/GC.
 * - Works in both main thread and worker.
 * - Never uses `any`; fully typed.
 */

export type CanvasLike = HTMLCanvasElement | OffscreenCanvas;
export type Ctx2D =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export type RentOptions = {
  /** If true, the pool will try to find a canvas with *at least* the size; otherwise exact. Default: true */
  allowLarger?: boolean;
  /** If provided, the canvas will be cleared before returned (CSS px). Default: true */
  clear?: boolean;
};

export type PoolStats = {
  free: number;
  busy: number;
  total: number;
};

type Pooled = {
  canvas: CanvasLike;
  width: number; // device pixels
  height: number; // device pixels
  busy: boolean;
};

function hasOffscreen(): boolean {
  return typeof OffscreenCanvas !== "undefined";
}

function createCanvas(width: number, height: number): CanvasLike {
  if (hasOffscreen()) return new OffscreenCanvas(width, height);
  // In workers `document` is undefined; this is guarded by hasOffscreen()
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
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

/** Ensure device-pixel size; does not set CSS style size (callers control that). */
function ensureSize(c: CanvasLike, w: number, h: number): void {
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
}

export class CanvasPool {
  private items: Pooled[] = [];
  private _maxFree: number;

  constructor(maxFree: number = 16) {
    this._maxFree = Math.max(0, Math.floor(maxFree));
  }

  stats(): PoolStats {
    const total = this.items.length;
    const busy = this.items.reduce((n, it) => (it.busy ? n + 1 : n), 0);
    return { free: total - busy, busy, total };
  }

  /** Rent a canvas in device pixels. */
  rent(
    width: number,
    height: number,
    opt: RentOptions = { allowLarger: true, clear: true }
  ): { canvas: CanvasLike; release: () => void } {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    const allowLarger = opt.allowLarger ?? true;
    const needClear = opt.clear ?? true;

    let idx = -1;

    // Find an idle canvas that fits the request
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.busy) continue;
      const sizeOk = allowLarger
        ? it.width >= w && it.height >= h
        : it.width === w && it.height === h;
      if (sizeOk) {
        idx = i;
        break;
      }
    }

    let pooled: Pooled;
    if (idx >= 0) {
      pooled = this.items[idx];
      // Resize up if needed (only grows; avoids shrinking thrash)
      const nw = Math.max(pooled.width, w);
      const nh = Math.max(pooled.height, h);
      if (nw !== pooled.width || nh !== pooled.height) {
        ensureSize(pooled.canvas, nw, nh);
        pooled.width = nw;
        pooled.height = nh;
      }
    } else {
      const canvas = createCanvas(w, h);
      pooled = { canvas, width: w, height: h, busy: false };
      this.items.push(pooled);
    }

    pooled.busy = true;

    if (needClear) {
      const ctx = get2D(pooled.canvas);
      // Identity transform and clear in device px
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
    if (this._maxFree < 0) return;

    // Partition into busy/free
    const busy: Pooled[] = [];
    const free: Pooled[] = [];
    for (const it of this.items) {
      (it.busy ? busy : free).push(it);
    }

    // Sort free by area descending so we keep the most generally useful
    free.sort((a, b) => b.width * b.height - a.width * a.height);

    const keep = free.slice(0, this._maxFree);
    const drop = free.slice(this._maxFree);

    // Rebuild list
    this.items = busy.concat(keep);

    // Help GC by clearing references of dropped canvases (not strictly necessary)
    for (let i = 0; i < drop.length; i++) {
      // No explicit dispose API for canvas; just let them be GC’ed.
      // If these were attached to DOM elsewhere, caller should handle removal.
      // Here we just avoid retaining them.
      // (Intentional no-op body)
    }
  }

  setMaxFree(n: number): void {
    this._maxFree = Math.max(0, Math.floor(n));
    this.trim();
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Convenience: rent → draw (CSS space) → release, even on throw.
 * `fn` receives the rented canvas and its 2D context.
 */
export async function withCanvas<T>(
  pool: CanvasPool,
  width: number,
  height: number,
  fn: (canvas: CanvasLike, ctx: Ctx2D) => Promise<T> | T,
  opt?: RentOptions
): Promise<T> {
  const { canvas, release } = pool.rent(width, height, opt);
  try {
    const ctx = get2D(canvas);
    return await fn(canvas, ctx);
  } finally {
    release();
  }
}

/**
 * Create a snapshot bitmap from a canvas (clone, not transfer).
 * The ImageBitmap is transferable by the caller if needed.
 */
export async function snapshotBitmap(canvas: CanvasLike): Promise<ImageBitmap> {
  // createImageBitmap works for both HTMLCanvasElement and OffscreenCanvas
  return await createImageBitmap(canvas as unknown as CanvasImageSource);
}
