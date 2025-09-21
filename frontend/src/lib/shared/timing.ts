// src/lib/shared/timing.ts
// Timing utilities with strict types (no `any`). Works in browser and SSR (polyfills where needed).

/* ============================== time source ============================== */

const now: () => number =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? () => performance.now()
    : () => Date.now();

/* ============================== sleep & ticks ============================ */

/** Sleep for `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const id = setTimeout(resolve, Math.max(0, ms | 0));
    // type narrowing to keep ESLint happy in browser projects; no clear on resolve needed
    void id;
  });
}

export function nextMicrotask(): Promise<void> {
  if (typeof queueMicrotask === "function") {
    return new Promise((r) => queueMicrotask(r));
  }
  return Promise.resolve();
}

/* ============================== debounce ================================ */

export interface Debounced<TArgs extends unknown[], TReturn> {
  (...args: TArgs): void;
  /** Cancel any pending trailing invocation. */
  cancel(): void;
  /** If there’s a pending trailing call, run it immediately. */
  flush(): TReturn | undefined;
}

export interface DebounceOptions {
  /** Fire on the leading edge. Default: false. */
  leading?: boolean;
  /** Fire on the trailing edge. Default: true. */
  trailing?: boolean;
  /** Guarantee a call at least every `maxWait` ms. Default: undefined. */
  maxWait?: number;
}

/**
 * Debounce: run `fn` after it stops being called for `wait` ms.
 * - `leading`: fire immediately on first call in a burst.
 * - `trailing`: fire after the last call in a burst.
 * - `maxWait`: ensure we call no later than this many ms.
 */
export function debounce<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
  wait: number,
  options: DebounceOptions = {}
): Debounced<TArgs, TReturn> {
  const leading = Boolean(options.leading);
  const trailing = options.trailing !== false;
  const maxWait =
    typeof options.maxWait === "number"
      ? Math.max(0, options.maxWait)
      : undefined;

  let timerId: number | null = null;
  let lastCallTime = 0;
  let lastInvokeTime = 0;
  let lastArgs: TArgs | undefined;
  let lastResult: TReturn | undefined;

  const startTimer = (ms: number): void => {
    clearTimer();
    timerId = setTimeout(onTimer, ms) as unknown as number;
  };

  const clearTimer = (): void => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  const invoke = (time: number): void => {
    lastInvokeTime = time;
    const args = lastArgs as TArgs;
    lastArgs = undefined;
    lastResult = fn(...args);
  };

  const remainingWait = (time: number): number => {
    const sinceLastCall = time - lastCallTime;
    const sinceLastInvoke = time - lastInvokeTime;
    const timeWaiting = wait - sinceLastCall;
    const timeUntilMax =
      maxWait !== undefined
        ? maxWait - sinceLastInvoke
        : Number.POSITIVE_INFINITY;
    return Math.min(timeWaiting, timeUntilMax);
  };

  const onTimer = (): void => {
    const t = now();
    if (trailing && lastArgs !== undefined) invoke(t);
    clearTimer();
  };

  const debounced = ((...args: TArgs): void => {
    const t = now();
    const isLeadingEdge = lastCallTime === 0 && leading;
    lastCallTime = t;
    lastArgs = args;

    if (isLeadingEdge) {
      lastInvokeTime = t;
      lastResult = fn(...args);
    }

    const waitLeft = remainingWait(t);
    if (trailing || maxWait !== undefined) {
      startTimer(Math.max(0, waitLeft));
    }
  }) as Debounced<TArgs, TReturn>;

  debounced.cancel = (): void => {
    clearTimer();
    lastCallTime = 0;
    lastArgs = undefined;
  };

  debounced.flush = (): TReturn | undefined => {
    if (timerId !== null && lastArgs !== undefined) {
      onTimer();
      return lastResult;
    }
    return undefined;
  };

  return debounced;
}

/* ============================== throttle ================================ */

export interface ThrottleOptions {
  /** Fire on the leading edge. Default: true. */
  leading?: boolean;
  /** Fire on the trailing edge. Default: true. */
  trailing?: boolean;
}

/** Throttle: ensure `fn` runs at most once every `wait` ms. */
export function throttle<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  wait: number,
  options: ThrottleOptions = {}
): (...args: TArgs) => void {
  const leading = options.leading !== false;
  const trailing = options.trailing !== false;

  let lastInvokeTime = 0;
  let timerId: number | null = null;
  let lastArgs: TArgs | undefined;

  const startTimer = (ms: number): void => {
    clearTimer();
    timerId = setTimeout(onTimer, ms) as unknown as number;
  };
  const clearTimer = (): void => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  const invoke = (time: number): void => {
    lastInvokeTime = time;
    const args = lastArgs as TArgs;
    lastArgs = undefined;
    fn(...args);
  };

  const onTimer = (): void => {
    const t = now();
    if (trailing && lastArgs !== undefined) invoke(t);
    clearTimer();
  };

  return (...args: TArgs): void => {
    const t = now();
    if (lastInvokeTime === 0 && !leading) {
      lastInvokeTime = t;
    }
    const remaining = wait - (t - lastInvokeTime);
    lastArgs = args;

    if (remaining <= 0 || remaining > wait) {
      if (timerId === null) invoke(t);
    } else if (timerId === null && trailing) {
      startTimer(remaining);
    }
  };
}

/* ============================== RAF helpers ============================= */

type RafId = number;
type RafCallback = (timestamp: number) => void;

const requestFrame: (cb: RafCallback) => RafId =
  typeof requestAnimationFrame === "function"
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(() => cb(now()), 16) as unknown as number;

const cancelFrame: (id: RafId) => void =
  typeof cancelAnimationFrame === "function"
    ? (id) => cancelAnimationFrame(id)
    : (id) => clearTimeout(id as unknown as number);

/** Throttle a function to once per animation frame, using the latest args. */
export interface RafThrottled<TArgs extends unknown[]> {
  (...args: TArgs): void;
  cancel(): void;
}

export function rafThrottle<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void
): RafThrottled<TArgs> {
  let rafId: RafId | 0 = 0;
  let queued = false;
  let lastArgs: TArgs | undefined;

  const schedule = (): void => {
    if (queued) return;
    queued = true;
    rafId = requestFrame(() => {
      queued = false;
      const args = lastArgs as TArgs;
      lastArgs = undefined;
      fn(...args);
    });
  };

  const throttled = ((...args: TArgs): void => {
    lastArgs = args;
    schedule();
  }) as RafThrottled<TArgs>;

  throttled.cancel = (): void => {
    if (rafId) {
      cancelFrame(rafId);
      rafId = 0;
    }
    queued = false;
    lastArgs = undefined;
  };

  return throttled;
}

/** Batch many small jobs into a single RAF tick (FIFO). */
export interface RafBatch {
  push(job: () => void): void;
  cancel(): void;
}

export function createRafBatch(): RafBatch {
  let rafId: RafId | 0 = 0;
  const queue: Array<() => void> = [];

  const pump = (): void => {
    rafId = 0;
    const jobs = queue.splice(0, queue.length);
    for (const job of jobs) job();
  };

  return {
    push(job: () => void): void {
      queue.push(job);
      if (!rafId) {
        rafId = requestFrame(pump);
      }
    },
    cancel(): void {
      if (rafId) {
        cancelFrame(rafId);
        rafId = 0;
      }
      queue.length = 0;
    },
  };
}

/* ============================== Frame budget ============================ */

/**
 * Frame budget helper.
 * Call `begin(budgetMs)` at frame start, then `canContinue()` inside loops
 * to break work over multiple frames (prevents jank).
 */
export interface FrameBudget {
  begin(budgetMs: number): void;
  canContinue(): boolean;
  elapsed(): number;
}

export function createFrameBudget(): FrameBudget {
  let startTime = 0;
  let budget = 0;

  return {
    begin(budgetMs: number): void {
      startTime = now();
      budget = Math.max(0, budgetMs);
    },
    canContinue(): boolean {
      return now() - startTime < budget;
    },
    elapsed(): number {
      return now() - startTime;
    },
  };
}

/* ============================== Idle scheduling ========================= */

export interface IdleDeadline {
  didTimeout: boolean;
  timeRemaining(): number;
}

function hasRequestIdleCallback(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    typeof (globalThis as { requestIdleCallback?: unknown })
      .requestIdleCallback === "function"
  );
}

/** Schedule a low-priority task (falls back to setTimeout). Returns an id for cancellation. */
export function scheduleIdle(
  callback: (deadline: IdleDeadline) => void,
  timeoutMs = 100
): number {
  if (hasRequestIdleCallback()) {
    /// eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (
      globalThis as unknown as {
        requestIdleCallback: (
          cb: (d: IdleDeadline) => void,
          opts?: { timeout: number }
        ) => number;
      }
    ).requestIdleCallback(callback, { timeout: timeoutMs });
  }
  const start = now();
  const id = setTimeout(
    () => {
      const deadline: IdleDeadline = {
        didTimeout: true,
        timeRemaining: () => Math.max(0, timeoutMs - (now() - start)),
      };
      callback(deadline);
    },
    Math.max(1, timeoutMs)
  ) as unknown as number;
  return id;
}

export function cancelIdle(id: number): void {
  if (hasRequestIdleCallback()) {
    /// eslint-disable-next-line @typescript-eslint/no-explicit-any
    (
      globalThis as unknown as { cancelIdleCallback: (handle: number) => void }
    ).cancelIdleCallback(id);
  } else {
    clearTimeout(id as unknown as number);
  }
}

/* ============================== RAF ticker ============================== */

/** Per-frame ticker for continuous simulations (particles, previews, etc.). */
export type TickerSubscriber = (deltaSeconds: number, nowMs: number) => void;

export class RafTicker {
  private running = false;
  private rafId: RafId | 0 = 0;
  private lastMs = 0;
  private readonly subs = new Set<TickerSubscriber>();

  add(subscriber: TickerSubscriber): () => void {
    this.subs.add(subscriber);
    return () => this.subs.delete(subscriber);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastMs = now();

    const step = (): void => {
      if (!this.running) return;
      const t = now();
      const dt = (t - this.lastMs) / 1000; // seconds
      this.lastMs = t;
      for (const cb of this.subs) cb(dt, t);
      this.rafId = requestFrame(step);
    };

    step();
  }

  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelFrame(this.rafId);
      this.rafId = 0;
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}

export const timeNow = now;
