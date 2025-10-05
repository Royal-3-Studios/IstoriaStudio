/// <reference lib="webworker" />

import type { BitmapResponse } from "@/lib/brush/messages";

/** Inside a dedicated worker: send to the main thread. */
export function postBitmapFromWorkerSelf(
  selfRef: DedicatedWorkerGlobalScope,
  bitmap: ImageBitmap,
  extra?: Omit<BitmapResponse, "kind" | "bitmap">
): void {
  const msg: BitmapResponse = { kind: "bitmap", bitmap, ...(extra ?? {}) };
  selfRef.postMessage(msg, [bitmap]);
}
