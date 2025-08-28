// =============================================================
// src/components/editor/tools/ToolsToolbar.tsx
// =============================================================
"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { useEditorTools } from "../context/EditorToolsProvider";
import { ALL_TOOLS, TOOL_META } from "./registry";

export function ToolsToolbar({ className = "" }: { className?: string }) {
  const { state, dispatch } = useEditorTools();
  return (
    <div className={["flex flex-wrap items-center gap-1", className].join(" ")}>
      {ALL_TOOLS.map((id) => {
        const meta = TOOL_META[id];
        const Icon = meta.icon;
        const active = state.active === id;
        return (
          <Button
            key={id}
            variant={active ? "secondary" : "ghost"}
            size="icon"
            title={meta.label}
            aria-pressed={active}
            aria-expanded={active ? state.open : false}
            onClick={() => dispatch({ type: "TOGGLE", tool: id })}
            className="h-9 w-9 cursor-pointer"
          >
            <Icon className="h-5 w-5" />
          </Button>
        );
      })}
    </div>
  );
}
