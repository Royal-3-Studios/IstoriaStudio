// FILE: src/lib/brush/backends/adapter.types.ts
import type { CanvasLike } from "./utils/canvas";
import type { RenderOptions } from "@/lib/brush/engine.types";
import type { BackendCaps } from "./caps";
export type BackendAdapterId = string;

export interface BackendAdapter {
  id: BackendAdapterId;

  /** Draw into a CanvasLike honoring DPR, color, overrides, etc. */
  drawToCanvas: (
    canvas: CanvasLike,
    opts: RenderOptions
  ) => Promise<void> | void;

  /** Optional capabilities (strongly typed) */
  caps?: Readonly<BackendCaps>;
}
