// FILE: src/lib/brush/workerTypes.ts
// Shared DTOs for the brush worker <-> main thread protocol.
// Keep these serializable (no DOM objects). Use ImageBitmap only in responses.

// ---------------------------- basic shapes ----------------------------

/** Minimal path point used for worker rendering. CSS px coordinates. */
export type WorkerPathPoint = {
  x: number;
  y: number;
  /** Optional pressure 0..1 (if available from your pipeline). */
  pressure?: number;
  /** Optional radians tangent; mostly unused in worker preview. */
  angle?: number;
};

/**
 * A minimal rendering options payload that is JSON-serializable.
 * You can widen this later or pass your app's RenderOptions after
 * pruning functions/classes/DOM references.
 */
export type WorkerRenderOptions = {
  /** Base diameter in CSS px. */
  baseSizePx: number;
  /** Canvas width/height in CSS px. */
  width: number;
  height: number;
  /** Optional color as hex or css color. */
  color?: string;
  /** Optional engine config blob (serializable only). */
  engine?: unknown;
  /** Optional per-stroke overrides (serializable only). */
  overrides?: unknown;
  /** Optional pixel ratio hint; worker may rescale. */
  pixelRatio?: number;
};

// ---------------------------- requests ----------------------------

export type InitMsg = {
  kind: "init";
  /** Logical size (CSS px); worker will scale by dpr internally. */
  width: number;
  height: number;
  /** Device pixel ratio to size the OffscreenCanvas backing store. */
  dpr?: number;
};

export type ResizeMsg = {
  kind: "resize";
  width: number;
  height: number;
  dpr?: number;
};

export type PingMsg = {
  kind: "ping";
};

export type SnapshotMsg = {
  kind: "snapshot";
  /** Optional: identify a logical layer if you expand later. */
  layerId?: string;
};

export type RenderStrokeMsg = {
  kind: "renderStroke";
  /** Logical layer identifier (optional today; future-friendly). */
  layerId?: string;
  /** Serializable render options (see type above). */
  opts: WorkerRenderOptions;
  /** Stroke path points in CSS px. */
  path: ReadonlyArray<WorkerPathPoint>;
  /** Optional seed for deterministic RNG. */
  seed?: number;
};

export type WorkerRequest =
  | InitMsg
  | ResizeMsg
  | PingMsg
  | SnapshotMsg
  | RenderStrokeMsg;

// ---------------------------- responses ----------------------------

export type AckResponse = {
  kind: "ack";
  /** Which request was acknowledged (e.g., "init", "resize"). */
  for: InitMsg["kind"] | ResizeMsg["kind"];
};

export type PongResponse = { kind: "pong" };

export type ErrorResponse = {
  kind: "error";
  message: string;
};

export type DoneResponse = {
  kind: "done";
  /** Optional correlation id if you add one later. */
  id?: string;
};

/**
 * Bitmap payload returned by the worker after a render or snapshot.
 * The ImageBitmap is Transferable (zero-copy).
 */
export type BitmapResponse = {
  kind: "bitmap";
  bitmap: ImageBitmap;
  /** Optional layer identifier the bitmap corresponds to. */
  layerId?: string;
};

export type WorkerResponse =
  | AckResponse
  | PongResponse
  | ErrorResponse
  | DoneResponse
  | BitmapResponse;

// ------------------------ type guards (optional) ------------------------

export function isBitmapResponse(m: WorkerResponse): m is BitmapResponse {
  return m.kind === "bitmap";
}

export function isAck(m: WorkerResponse): m is AckResponse {
  return m.kind === "ack";
}

export function isError(m: WorkerResponse): m is ErrorResponse {
  return m.kind === "error";
}

export function isPong(m: WorkerResponse): m is PongResponse {
  return m.kind === "pong";
}
