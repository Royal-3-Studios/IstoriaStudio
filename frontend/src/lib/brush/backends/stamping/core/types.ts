// FILE: src/lib/brush/backends/stamping/core/types.ts
import type { StampingMode } from "../index";

export type StampingBackendLocal = {
  mode?: StampingMode;
};

export type GraphitePassOpts = {
  lineWidth: number;
  alpha: number;
  blurPx?: number;
  composite?: GlobalCompositeOperation;
  color: string;
};
