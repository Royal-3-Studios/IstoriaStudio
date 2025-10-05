import type { BitmapResponse } from "@/lib/brush/messages";

/** Post an ImageBitmap to a Window/iframe with a targetOrigin. */
export function postBitmapToWindow(
  win: Window,
  targetOrigin: string,
  bitmap: ImageBitmap,
  extra?: Omit<BitmapResponse, "kind" | "bitmap">
): void {
  const msg: BitmapResponse = { kind: "bitmap", bitmap, ...(extra ?? {}) };
  win.postMessage(msg, targetOrigin, [bitmap]);
}
