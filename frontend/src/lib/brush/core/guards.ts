// src/lib/brush/core/guards.ts

/** Asserts a value is defined and returns it as non-optional. */
export function assertDefined<T>(
  v: T | null | undefined,
  msg = "Value is undefined"
): T {
  if (v == null) throw new Error(msg);
  return v;
}

/** Safe numeric read from unknown/optional sources with a default. */
export function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Safe read for optional fields when exactOptionalPropertyTypes is on. */
export function opt<T>(v: T | undefined, fallback: T): T {
  return v === undefined ? fallback : v;
}
