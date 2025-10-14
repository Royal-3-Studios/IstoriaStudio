import { create } from "zustand";

export type Viewport = {
  /** 1 = 100% */
  zoom: number;
  /** device pixel ratio (capped) */
  dpr: number;
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
  /** Increase zoom by an optional step (default 0.1). Non-numbers are ignored. */
  zoomIn: (step?: number) => void;
  /** Decrease zoom by an optional step (default 0.1). Non-numbers are ignored. */
  zoomOut: (step?: number) => void;
  resetZoom: () => void;
};

const ZOOM_MIN = 0.05; // keep in sync with EditorScreen
const ZOOM_MAX = 3; // keep in sync with EditorScreen

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const clampZoom = (z: number) => clamp(z, ZOOM_MIN, ZOOM_MAX);

const initialZoom = 1;
const initialDpr =
  typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

export const useEditorStore = create<EditorState>((set, get) => ({
  viewport: { zoom: initialZoom, dpr: initialDpr },
  tool: { name: "select" },

  setZoom: (zoom: number) =>
    set((s) => ({ viewport: { ...s.viewport, zoom: clampZoom(zoom) } })),

  setDpr: (dpr: number) => set((s) => ({ viewport: { ...s.viewport, dpr } })),

  setTool: (tool: Tool) => set({ tool }),

  zoomIn: (step?: number) => {
    const inc = Number.isFinite(step as number) ? (step as number) : 0.1;
    const current = get().viewport.zoom;
    const next = clampZoom(Math.round((current + inc) * 100) / 100);
    set((s) => ({ viewport: { ...s.viewport, zoom: next } }));
  },

  zoomOut: (step?: number) => {
    const dec = Number.isFinite(step as number) ? (step as number) : 0.1;
    const current = get().viewport.zoom;
    const next = clampZoom(Math.round((current - dec) * 100) / 100);
    set((s) => ({ viewport: { ...s.viewport, zoom: next } }));
  },

  resetZoom: () => set((s) => ({ viewport: { ...s.viewport, zoom: 1 } })),
}));
