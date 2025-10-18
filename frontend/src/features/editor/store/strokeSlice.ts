// FILE: src/features/editor/store/strokeSlice.ts
import { create } from "zustand";
import type { RenderPathPoint } from "@/lib/brush/engine.types";
import { collectCoalescedPoints } from "@/lib/brush/pointer";

export type CurrentStroke = {
  id: string;
  startedAtMs: number;
  points: RenderPathPoint[]; // every point has t (ms) + p/pressure
  isDrawing: boolean;
};

type StrokeState = {
  // NOTE: not optional; union allows undefined so we can explicitly set it
  current: CurrentStroke | undefined;
  startStroke: (id: string, initial?: RenderPathPoint) => void;
  addPointerEvent: (e: PointerEvent) => void;
  endStroke: () => void;
  reset: () => void;
};

export const useStrokeStore = create<StrokeState>((set, get) => ({
  current: undefined,

  startStroke: (id, initial) =>
    set(() => ({
      current: {
        id,
        startedAtMs: initial?.t ?? Date.now(),
        points: initial ? [initial] : [],
        isDrawing: true,
      },
    })),

  addPointerEvent: (e) =>
    set((s) => {
      const cur = s.current;
      if (!cur || !cur.isDrawing) return {};
      const pts = collectCoalescedPoints(e);
      return { current: { ...cur, points: cur.points.concat(pts) } };
    }),

  endStroke: () =>
    set((s) => {
      const cur = s.current;
      if (!cur) return {};
      return { current: { ...cur, isDrawing: false } };
    }),

  reset: () => set({ current: undefined }),
}));
