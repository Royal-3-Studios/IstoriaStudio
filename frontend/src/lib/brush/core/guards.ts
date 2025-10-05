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

/** Bounds-checked array indexer (works with noUncheckedIndexedAccess). */
export function atOrThrow<T>(
  arr: ReadonlyArray<T>,
  i: number,
  msg?: string
): T {
  if (!Number.isInteger(i))
    throw new Error(msg ?? `Index ${i} is not an integer`);
  if (i < 0 || i >= arr.length)
    throw new Error(msg ?? `Index ${i} out of range (len=${arr.length})`);
  // After the range check, TS still types arr[i] as T|undefined under
  // noUncheckedIndexedAccess; cast is safe because we just proved bounds.
  return arr[i] as T;
}

/** Map getter that throws if the key is missing. */
export function getOrThrow<K, V>(m: ReadonlyMap<K, V>, k: K, msg?: string): V {
  const v = m.get(k);
  if (v === undefined) throw new Error(msg ?? `Missing key in Map`);
  return v;
}
