import type { BitmapResponse } from "@/lib/brush/messages";

/** Union of targets that accept a transfer list. */
type PortLike = Worker | MessagePort;

/** Post an ImageBitmap to a Worker/MessagePort with a transfer list. */
export function postBitmapToPort(
  port: PortLike,
  bitmap: ImageBitmap,
  extra?: Omit<BitmapResponse, "kind" | "bitmap">
): void {
  const msg: BitmapResponse = { kind: "bitmap", bitmap, ...(extra ?? {}) };
  port.postMessage(msg, [bitmap]);
}
