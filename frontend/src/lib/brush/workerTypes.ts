// Discriminated unions + guards for worker messaging (no `any`).

import type { EngineConfig, RenderOverrides } from "@/lib/brush/engine.types";

export type WorkerPathPoint = {
  x: number;
  y: number;
  pressure?: number;
  angle?: number;
};

export type WorkerRenderOptions = {
  engine: EngineConfig | Record<string, never>;
  baseSizePx: number;
  color?: string;
  width: number;
  height: number;
  pixelRatio?: number;
  overrides?: Partial<RenderOverrides>;
  // You can add `input?: BrushInputConfig` later if/when the worker consumes it.
};

/* ----------------------------- Requests ----------------------------- */

export type InitMsg = {
  kind: "init";
  width: number;
  height: number;
  dpr: number;
};

export type ResizeMsg = {
  kind: "resize";
  width: number;
  height: number;
  dpr: number;
};

export type PingMsg = { kind: "ping" };
export type SnapshotMsg = { kind: "snapshot" };

export type RenderStrokeMsg = {
  kind: "renderStroke";
  layerId?: string;
  opts: WorkerRenderOptions;
  path: ReadonlyArray<WorkerPathPoint>;
  seed?: number;
};

export type WorkerRequest =
  | InitMsg
  | ResizeMsg
  | PingMsg
  | SnapshotMsg
  | RenderStrokeMsg;

/* ----------------------------- Responses ---------------------------- */

export type AckResponse =
  | { kind: "ack"; for: "init" }
  | { kind: "ack"; for: "resize" };

export type PongResponse = { kind: "pong" };
export type ErrorResponse = { kind: "error"; message: string };
export type BitmapResponse = { kind: "bitmap"; bitmap: ImageBitmap };

export type WorkerResponse =
  | AckResponse
  | PongResponse
  | ErrorResponse
  | BitmapResponse;

/* ------------------------------ Guards ------------------------------ */

export function isAck(m: WorkerResponse): m is AckResponse {
  return m.kind === "ack";
}
export function isPong(m: WorkerResponse): m is PongResponse {
  return m.kind === "pong";
}
export function isError(m: WorkerResponse): m is ErrorResponse {
  return m.kind === "error";
}
export function isBitmapResponse(m: WorkerResponse): m is BitmapResponse {
  return m.kind === "bitmap" && typeof m.bitmap === "object";
}
