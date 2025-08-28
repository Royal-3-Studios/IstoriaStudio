// =============================================================
// src/components/editor/context/EditorToolsProvider.tsx
// Centralizes tool + options state so any component (EditBar, canvas, sidebars)
// can read/write without prop-drilling.
// =============================================================
"use client";
import React from "react";
import type { ToolId, ToolOptions } from "../types";

export type ToolsState = {
  active: ToolId | null;
  open: boolean; // options dock open/closed
  options: Partial<ToolOptions>;
};

export type ToolsAction =
  | { type: "TOGGLE"; tool: ToolId }
  | { type: "CLOSE" }
  | { type: "PATCH_OPTIONS"; patch: Partial<ToolOptions> };

function reducer(state: ToolsState, action: ToolsAction): ToolsState {
  switch (action.type) {
    case "TOGGLE": {
      if (state.active === action.tool) {
        return { ...state, open: !state.open };
      }
      return { ...state, active: action.tool, open: true };
    }
    case "CLOSE":
      return { ...state, open: false };
    case "PATCH_OPTIONS":
      return { ...state, options: { ...state.options, ...action.patch } };
    default:
      return state;
  }
}

const ToolsCtx = React.createContext<{
  state: ToolsState;
  dispatch: React.Dispatch<ToolsAction>;
} | null>(null);

export function EditorToolsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, dispatch] = React.useReducer(reducer, {
    active: null,
    open: false,
    options: {
      stroke: "#ffffff",
      strokeWidth: 8,
      fill: "#000000",
      opacity: 100,
      blendMode: "normal",
      fontFamily: "Inter",
      fontSize: 24,
      fontWeight: 600,
      lineCap: "round",
      lineJoin: "round",
    },
  });
  return (
    <ToolsCtx.Provider value={{ state, dispatch }}>
      {children}
    </ToolsCtx.Provider>
  );
}

export function useEditorTools() {
  const ctx = React.useContext(ToolsCtx);
  if (!ctx)
    throw new Error("useEditorTools must be used within EditorToolsProvider");
  return ctx;
}
