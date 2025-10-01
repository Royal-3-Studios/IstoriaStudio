// FILE: src/lib/brush/backends/utils/typing.ts
import type { BrushInputConfig } from "@/data/brushPresets";

/** Narrower: opts has a string color */
export function hasColor<T extends { color?: unknown }>(
  o: T
): o is T & { color: string } {
  return typeof o.color === "string";
}

/** Narrower: opts has a numeric pixelRatio */
export function hasPixelRatio<T extends { pixelRatio?: unknown }>(
  o: T
): o is T & { pixelRatio: number } {
  return typeof o.pixelRatio === "number" && Number.isFinite(o.pixelRatio);
}

/** Narrower: opts has a numeric dpr (legacy alias) */
export function hasDpr<T extends { dpr?: unknown }>(
  o: T
): o is T & { dpr: number } {
  return typeof o.dpr === "number" && Number.isFinite(o.dpr);
}

/** Narrower: opts has a BrushInputConfig */
export function hasInput<T extends { input?: unknown }>(
  o: T
): o is T & { input: BrushInputConfig } {
  return typeof o.input === "object" && o.input !== null;
}
