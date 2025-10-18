import type { CurvePoint } from "./index";

export const STOCK_CURVES: Record<string, CurvePoint[]> = {
  softTaper: [
    { x: 0, y: 0 },
    { x: 0.2, y: 0.05 },
    { x: 0.7, y: 0.8 },
    { x: 1, y: 1 },
  ],
  sharpTaper: [
    { x: 0, y: 0 },
    { x: 0.3, y: 0.9 },
    { x: 1, y: 1 },
  ],
  pressureToOpacity: [
    { x: 0, y: 0 },
    { x: 0.5, y: 0.6 },
    { x: 1, y: 1 },
  ],
  speedToFlow: [
    { x: 0, y: 1 },
    { x: 0.3, y: 0.6 },
    { x: 1, y: 0.2 },
  ],
};
