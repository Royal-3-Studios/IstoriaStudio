// FILE: src/lib/painting/history.ts
// Command log for instant undo/redo using full-layer snapshots.
// Tiny, deterministic, and backend-agnostic.

import type { LayerStack, Layer, LayerSnapshot } from "./layers";
import { snapshotLayer, restoreLayer, findLayer } from "./layers";

export type HistoryKind = "stroke" | "erase" | "layerOp" | "other";

export interface HistoryEntry {
  id: string;
  kind: HistoryKind;
  layerId: string;
  // Pre/post snapshots for instant undo/redo
  before: LayerSnapshot | null;
  after: LayerSnapshot | null;
  // Optional metadata for UI/analytics
  meta?: Record<string, unknown>;
}

export interface History {
  stack: LayerStack;
  entries: HistoryEntry[];
  index: number; // last applied entry index; -1 when nothing applied
  limit: number; // cap to avoid unbounded memory
}

/* ----------------------------------------------------------------------------
 * Construction & utils
 * -------------------------------------------------------------------------- */

export function createHistory(stack: LayerStack, limit = 100): History {
  return { stack, entries: [], index: -1, limit: Math.max(1, limit) };
}

function uuid(): string {
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return `h_${(++_uidCounter).toString(36)}`;
}
let _uidCounter = 0;

/* ----------------------------------------------------------------------------
 * Snapshot hashing / equality (cheap, downscaled)
 * -------------------------------------------------------------------------- */

function createCanvas(
  w: number,
  h: number
): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function get2D(
  c: HTMLCanvasElement | OffscreenCanvas
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");
  return ctx;
}

/** Draw any LayerSnapshot into a tiny canvas, then return a fast rolling hash. */
async function hashSnapshot(
  snap: LayerSnapshot,
  thumbW = 64,
  thumbH = 64
): Promise<number> {
  // Stage 1: ensure we have a CanvasImageSource to draw from at native size
  let srcCanvas: HTMLCanvasElement | OffscreenCanvas;
  let srcW = 0;
  let srcH = 0;

  if (snap instanceof ImageBitmap) {
    srcW = snap.width;
    srcH = snap.height;
    srcCanvas = createCanvas(srcW, srcH);
    const x = get2D(srcCanvas);
    x.drawImage(snap, 0, 0);
  } else {
    // ImageData
    srcW = snap.width;
    srcH = snap.height;
    srcCanvas = createCanvas(srcW, srcH);
    const x = get2D(srcCanvas) as CanvasRenderingContext2D;
    x.putImageData(snap, 0, 0);
  }

  // Stage 2: draw to tiny thumbnail
  const thumb = createCanvas(thumbW, thumbH);
  const tx = get2D(thumb);
  tx.drawImage(srcCanvas as CanvasImageSource, 0, 0, thumbW, thumbH);

  // Stage 3: hash the pixels (xor/imul rolling hash over bytes)
  const id = (tx as CanvasRenderingContext2D).getImageData(
    0,
    0,
    thumbW,
    thumbH
  );
  const d = id.data;
  let h = 2166136261 >>> 0; // FNV-ish start
  for (let i = 0; i < d.length; i++) {
    h ^= d[i];
    h = Math.imul(h, 16777619) >>> 0;
    // a touch of mixing every 16 bytes
    if ((i & 15) === 15) h ^= h >>> 13;
  }
  // final avalanche
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Return true if two snapshots look identical (by downscaled hash). */
async function snapshotsEqual(
  a: LayerSnapshot | null,
  b: LayerSnapshot | null
): Promise<boolean> {
  if (a === b) return true; // same object or both null
  if (!a || !b) return false;
  // Quick dimension check when both ImageData
  if (!(a instanceof ImageBitmap) && !(b instanceof ImageBitmap)) {
    if (a.width !== b.width || a.height !== b.height) return false;
  }
  const [ha, hb] = await Promise.all([hashSnapshot(a), hashSnapshot(b)]);
  return ha === hb;
}

/* ----------------------------------------------------------------------------
 * Core push helpers
 * -------------------------------------------------------------------------- */

/**
 * Push a single entry, trimming redo tail and enforcing the limit.
 */
async function pushEntry(
  hist: History,
  entry: Omit<HistoryEntry, "id">
): Promise<void> {
  // If nothing visually changed, skip recording.
  if (await snapshotsEqual(entry.before, entry.after)) {
    // Still advance index to the last kept entry (no-op push).
    return;
  }

  // If we undid some steps and then draw again, drop the redo chain.
  if (hist.index < hist.entries.length - 1) {
    hist.entries.splice(hist.index + 1);
  }

  hist.entries.push({ ...entry, id: uuid() });

  // Enforce ring buffer limit
  if (hist.entries.length > hist.limit) {
    const dropCount = hist.entries.length - hist.limit;
    hist.entries.splice(0, dropCount);
    hist.index = Math.max(-1, hist.index - dropCount);
  } else {
    hist.index = hist.entries.length - 1;
  }
}

/* ----------------------------------------------------------------------------
 * Recording operations
 * -------------------------------------------------------------------------- */

/**
 * Record a stroke-like operation:
 * - caller supplies a draw function that mutates the target layer's canvas
 * - history captures before/after snapshots and pushes one entry
 */
export async function recordStroke(
  hist: History,
  layerId: string,
  draw: (layer: Layer) => Promise<void> | void,
  meta?: Record<string, unknown>
): Promise<void> {
  const layer = findLayer(hist.stack, layerId);
  if (!layer) return;

  const before = await snapshotLayer(layer);
  await draw(layer);
  const after = await snapshotLayer(layer);

  await pushEntry(hist, {
    kind: "stroke",
    layerId,
    before,
    after,
    meta,
  });
}

/** Convenience: record an erase operation (same mechanics, different kind). */
export async function recordErase(
  hist: History,
  layerId: string,
  erase: (layer: Layer) => Promise<void> | void,
  meta?: Record<string, unknown>
): Promise<void> {
  const layer = findLayer(hist.stack, layerId);
  if (!layer) return;

  const before = await snapshotLayer(layer);
  await erase(layer);
  const after = await snapshotLayer(layer);

  await pushEntry(hist, {
    kind: "erase",
    layerId,
    before,
    after,
    meta,
  });
}

/**
 * Record an arbitrary layer operation (transform, move, reorder, merge, etc.)
 * The mutator may change multiple layers; `layerId` should be the primary target.
 */
export async function recordLayerOp(
  hist: History,
  layerId: string,
  mutate: (stack: LayerStack) => Promise<void> | void,
  takeSnapshotOf: string = layerId,
  meta?: Record<string, unknown>
): Promise<void> {
  const target = findLayer(hist.stack, takeSnapshotOf);
  if (!target) return;

  const before = await snapshotLayer(target);
  await mutate(hist.stack);
  const after = await snapshotLayer(target);

  await pushEntry(hist, {
    kind: "layerOp",
    layerId,
    before,
    after,
    meta,
  });
}

/* ----------------------------------------------------------------------------
 * Query & navigation
 * -------------------------------------------------------------------------- */

export function canUndo(hist: History): boolean {
  return hist.index >= 0;
}
export function canRedo(hist: History): boolean {
  return hist.index < hist.entries.length - 1;
}

export async function undo(hist: History): Promise<void> {
  if (!canUndo(hist)) return;
  const entry = hist.entries[hist.index];
  const layer = findLayer(hist.stack, entry.layerId);
  if (layer && entry.before) {
    await restoreLayer(layer, entry.before);
  }
  hist.index--;
}

export async function redo(hist: History): Promise<void> {
  if (!canRedo(hist)) return;
  const entry = hist.entries[hist.index + 1];
  const layer = findLayer(hist.stack, entry.layerId);
  if (layer && entry.after) {
    await restoreLayer(layer, entry.after);
  }
  hist.index++;
}

/* ----------------------------------------------------------------------------
 * Maintenance
 * -------------------------------------------------------------------------- */

export function clearHistory(hist: History): void {
  hist.entries = [];
  hist.index = -1;
}

export function setHistoryLimit(hist: History, limit: number): void {
  hist.limit = Math.max(1, limit);
  if (hist.entries.length > hist.limit) {
    const drop = hist.entries.length - hist.limit;
    hist.entries.splice(0, drop);
    hist.index = Math.max(-1, hist.index - drop);
  }
}

/** Shallow describe the current entry for UI (safe to call anytime). */
export function peek(hist: History): HistoryEntry | null {
  if (!canUndo(hist)) return null;
  return hist.entries[hist.index] ?? null;
}
