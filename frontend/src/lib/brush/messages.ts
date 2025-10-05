// FILE: src/lib/brush/messages.ts

// Discriminated unions + guards for worker messaging (no `any` and no loose casts).
// Includes light runtime validation helpers to gate untyped postMessage payloads.

import type { EngineConfig, RenderOverrides } from "@/lib/brush/engine.types";
import type { BrushInputConfig } from "@/data/brushPresets";

/* ========================================================================== *
 * Shared / base types
 * ========================================================================== */

export type WorkerPathPoint = Readonly<{
  x: number;
  y: number;
  pressure?: number;
  angle?: number;
}>;

export type WorkerRenderOptions = Readonly<{
  /** Full engine config for the stroke. */
  engine: EngineConfig;
  /** Nominal diameter in CSS px. */
  baseSizePx: number;
  /** Hex color string, defaults engine-level if omitted. */
  color?: string;
  /** Target surface size in CSS px. */
  width: number;
  height: number;
  /** Device pixel ratio; worker can normalize. */
  pixelRatio?: number;
  /**
   * Per-stroke runtime overrides merged on top of engine.overrides.
   * Keep this narrow; deep backend knobs should live in engine.backendOverrides.
   */
  overrides?: Partial<RenderOverrides>;
  /**
   * Optional input metadata (pressure curve, spacing modulation, etc.)
   * Many engines can render without this; include if your worker consumes it.
   */
  input?: BrushInputConfig;
}>;

/* ========================================================================== *
 * Requests (main-thread -> worker)
 * ========================================================================== */

export type InitMsg = Readonly<{
  kind: "init";
  width: number;
  height: number;
  dpr: number;
  /** Optional protocol/version in case you evolve the schema. */
  version?: number;
}>;

export type ResizeMsg = Readonly<{
  kind: "resize";
  width: number;
  height: number;
  dpr: number;
}>;

export type PingMsg = Readonly<{
  kind: "ping";
  /** Optional correlation ID for round-trip timing. */
  id?: string;
}>;

export type SnapshotMsg = Readonly<{
  kind: "snapshot";
  /**
   * If your worker manages multiple layers, ask for a specific one.
   * When omitted, the worker decides (e.g., the composite).
   */
  layerId?: string;
}>;

export type RenderStrokeMsg = Readonly<{
  kind: "renderStroke";
  /** Optional routing for multi-layer engines. */
  layerId?: string;
  /** Rendering options (normalized or raw; worker may normalize). */
  opts: WorkerRenderOptions;
  /** Stroke path in CSS-space coordinates. */
  path: ReadonlyArray<WorkerPathPoint>;
  /** Optional RNG seed to make rendering deterministic. */
  seed?: number;
}>;

export type WorkerRequest =
  | InitMsg
  | ResizeMsg
  | PingMsg
  | SnapshotMsg
  | RenderStrokeMsg;

/* ========================================================================== *
 * Responses (worker -> main-thread)
 * ========================================================================== */

export type AckResponse = Readonly<
  | { kind: "ack"; for: "init"; version?: number }
  | { kind: "ack"; for: "resize" }
>;

export type PongResponse = Readonly<{
  kind: "pong";
  id?: string;
  /** Optional worker timestamp for RTT measurement. */
  ts?: number;
}>;

export type ErrorResponse = Readonly<{
  kind: "error";
  message: string;
  /** Optional error code for more specific handling. */
  code?: string;
}>;

export type BitmapResponse = Readonly<{
  kind: "bitmap";
  bitmap: ImageBitmap;
  /** Optional routing if you requested a particular layer. */
  layerId?: string;
}>;

export type DoneResponse = Readonly<{
  kind: "done";
  /** Optional layerId / stroke correlation. */
  layerId?: string;
}>;

export type WorkerResponse =
  | AckResponse
  | PongResponse
  | ErrorResponse
  | BitmapResponse
  | DoneResponse;

/* ========================================================================== *
 * Narrowing guards — Requests
 * ========================================================================== */

export function isInitMsg(m: unknown): m is InitMsg {
  return isObject(m) && m.kind === "init";
}
export function isResizeMsg(m: unknown): m is ResizeMsg {
  return isObject(m) && m.kind === "resize";
}
export function isPingMsg(m: unknown): m is PingMsg {
  return isObject(m) && m.kind === "ping";
}
export function isSnapshotMsg(m: unknown): m is SnapshotMsg {
  return isObject(m) && m.kind === "snapshot";
}
export function isRenderStrokeMsg(m: unknown): m is RenderStrokeMsg {
  if (!isObject(m) || m.kind !== "renderStroke") return false;
  const r = m as RenderStrokeMsg;
  return isRenderOptions(r.opts) && Array.isArray(r.path);
}

export function isWorkerRequest(m: unknown): m is WorkerRequest {
  return (
    isInitMsg(m) ||
    isResizeMsg(m) ||
    isPingMsg(m) ||
    isSnapshotMsg(m) ||
    isRenderStrokeMsg(m)
  );
}

/* ========================================================================== *
 * Narrowing guards — Responses
 * ========================================================================== */

export function isAck(m: unknown): m is AckResponse {
  return (
    isObject(m) && m.kind === "ack" && (m.for === "init" || m.for === "resize")
  );
}
export function isPong(m: unknown): m is PongResponse {
  return isObject(m) && m.kind === "pong";
}
export function isError(m: unknown): m is ErrorResponse {
  return isObject(m) && m.kind === "error" && typeof m.message === "string";
}
export function isBitmapResponse(m: unknown): m is BitmapResponse {
  return isObject(m) && m.kind === "bitmap" && typeof m.bitmap === "object";
}
export function isDoneResponse(m: unknown): m is DoneResponse {
  return isObject(m) && m.kind === "done";
}
export function isWorkerResponse(m: unknown): m is WorkerResponse {
  return (
    isAck(m) ||
    isPong(m) ||
    isError(m) ||
    isBitmapResponse(m) ||
    isDoneResponse(m)
  );
}

/* ========================================================================== *
 * Lightweight runtime validators (optional but handy with postMessage)
 * ========================================================================== */

export function isPathPoint(v: unknown): v is WorkerPathPoint {
  return (
    isObject(v) &&
    typeof v.x === "number" &&
    typeof v.y === "number" &&
    (typeof v.pressure === "number" || typeof v.pressure === "undefined") &&
    (typeof v.angle === "number" || typeof v.angle === "undefined")
  );
}

export function isRenderOptions(v: unknown): v is WorkerRenderOptions {
  if (!isObject(v)) return false;
  const o = v;
  return (
    isObject(o.engine) &&
    typeof o.baseSizePx === "number" &&
    typeof o.width === "number" &&
    typeof o.height === "number" &&
    (typeof o.color === "string" || typeof o.color === "undefined") &&
    (typeof o.pixelRatio === "number" || typeof o.pixelRatio === "undefined")
  );
}

/* ========================================================================== *
 * Utilities
 * ========================================================================== */

export function assertNever(x: never, msg = "Unexpected variant"): never {
  throw new Error(`${msg}: ${String(x)}`);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/* ========================================================================== *
 * Helpers for posting with transferables (optional)
 * ========================================================================== */

/**
 * Convenience wrapper to post an ImageBitmap and mark it transferable.
 * Example:
 *   postBitmap(self, bitmap, { layerId })
 */
export function postBitmap(
  port: MessagePort | DedicatedWorkerGlobalScope | Window,
  bitmap: ImageBitmap,
  extra?: Omit<BitmapResponse, "kind" | "bitmap">
): void {
  const msg: BitmapResponse = { kind: "bitmap", bitmap, ...(extra ?? {}) };
  // @ts-expect-error: Window.postMessage signature differs, but browsers ignore the transfer list for same-origin window.
  port.postMessage(msg, [bitmap as unknown as Transferable]);
}
