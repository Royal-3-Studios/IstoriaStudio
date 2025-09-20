// src/lib/brush/backends/utils/perf.ts

// Safe "now" across browser/SSR/Node
const now =
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? () => performance.now()
    : () => Date.now();

const marks = new Map<string, number>();
const stats = new Map<string, number>(); // aggregate durations and counters

/** Start a timer named `name`. Overwrites any existing mark with the same name. */
export function mark(name: string): void {
  marks.set(name, now());
}

/**
 * Stop the timer `name`, add its duration to `stats[name]`, and return the delta (ms).
 * If mark doesn't exist, returns 0 and does not modify stats.
 */
export function measure(name: string): number {
  const t0 = marks.get(name);
  if (t0 == null) return 0;
  marks.delete(name);
  const dt = now() - t0;
  stats.set(name, (stats.get(name) ?? 0) + dt);
  return dt;
}

/** Increment a named counter by `n` (default 1). Useful for "stamps drawn", etc. */
export function count(name: string, n = 1): void {
  stats.set(name, (stats.get(name) ?? 0) + n);
}

/** Read the accumulated value for `name` (ms for timers, raw count for counters). */
export function read(name: string): number {
  return stats.get(name) ?? 0;
}

/** Reset marks/stats for a single name, or clear all when `name` is omitted. */
export function reset(name?: string): void {
  if (typeof name === "string") {
    marks.delete(name);
    stats.delete(name);
  } else {
    marks.clear();
    stats.clear();
  }
}

/** Return a shallow snapshot of current stats (useful for logging/telemetry). */
export function snapshot(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of stats) out[k] = v;
  return out;
}

/**
 * Convenience wrapper that measures a synchronous function.
 * Example:
 *   const result = withMeasure("stamping:stroke", () => drawStroke(...));
 */
export function withMeasure<T>(name: string, fn: () => T): T {
  mark(name);
  try {
    return fn();
  } finally {
    measure(name);
  }
}
