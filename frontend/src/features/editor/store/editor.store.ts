// src/features/editor/store/editor.store.ts
import { create } from "zustand";

export type Viewport = {
  zoom: number; // 1 = 100%
  dpr: number; // device pixel ratio cap
};

export type ToolName = "brush" | "pan" | "select";

export type Tool =
  | { name: "select" }
  | { name: "pan" }
  | { name: "brush"; size: number; hardness?: number };

export type EditorState = {
  viewport: Viewport;
  tool: Tool;
  // actions
  setZoom: (zoom: number) => void;
  setDpr: (dpr: number) => void;
  setTool: (tool: Tool) => void;
  zoomIn: (step?: number) => void;
  zoomOut: (step?: number) => void;
  resetZoom: () => void;
};

const initialZoom = 1;
const initialDpr =
  typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

export const useEditorStore = create<EditorState>((set, get) => ({
  viewport: { zoom: initialZoom, dpr: initialDpr },
  tool: { name: "select" },
  setZoom: (zoom: number) =>
    set((s) => ({ viewport: { ...s.viewport, zoom } })),
  setDpr: (dpr: number) => set((s) => ({ viewport: { ...s.viewport, dpr } })),
  setTool: (tool: Tool) => set({ tool }),
  zoomIn: (step = 0.1) => {
    const next = Math.min(
      5,
      Math.round((get().viewport.zoom + step) * 100) / 100
    );
    set((s) => ({ viewport: { ...s.viewport, zoom: next } }));
  },
  zoomOut: (step = 0.1) => {
    const next = Math.max(
      0.05,
      Math.round((get().viewport.zoom - step) * 100) / 100
    );
    set((s) => ({ viewport: { ...s.viewport, zoom: next } }));
  },
  resetZoom: () => set((s) => ({ viewport: { ...s.viewport, zoom: 1 } })),
}));
