// =============================================================
// src/components/editor/tools/ToolOptionsDock.tsx
// Floating solid sheet; render under your top bar using absolute positioning
// =============================================================
"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { ToolId, ToolOptions, BooleanOp, PathAlign } from "../types";
import { TOOL_META } from "./registry";
import { BrushOptions } from "./options/BrushOptions";
import { TextOptions } from "./options/TextOptions";
import { ShapeOptions } from "./options/ShapeOptions";

export function ToolOptionsDock({
  open,
  tool,
  options,
  onChangeAction,
  onCloseAction,
  onBooleanOp,
  onPathAlign,
  className = "",
}: {
  open: boolean;
  tool: ToolId | null;
  options: Partial<ToolOptions>;
  onChangeAction: (patch: Partial<ToolOptions>) => void;
  onCloseAction: () => void;
  onBooleanOp?: (op: BooleanOp) => void;
  onPathAlign?: (align: PathAlign) => void;
  className?: string;
}) {
  if (!open || !tool) return null;
  const label = TOOL_META[tool].label;

  return (
    <div
      className={[
        "w-full rounded-md border bg-card shadow-xl",
        "animate-in fade-in slide-in-from-top-1 duration-150",
        className,
      ].join(" ")}
    >
      {/* Header */}
      {/* <div className="flex items-center gap-2 px-3 py-2 border-b">
        <span className="text-xs font-medium text-muted-foreground">
          {label} optionsss
        </span>
        <div className="ml-auto" />
        <Button
          size="icon"
          variant="ghost"
          onClick={onCloseAction}
          className="h-8 w-8 cursor-pointer"
          aria-label="Close tool options"
          title="Close"
        >
          <X className="h-4 w-4" />
        </Button>
      </div> */}

      {/* Body: route to per-tool options */}
      <div className="px-2 py-1 max-w-765">
        {tool === "brush" && (
          <BrushOptions options={options} onChangeAction={onChangeAction} />
        )}
        {tool === "text" && (
          <TextOptions options={options} onChangeAction={onChangeAction} />
        )}
        {(tool === "shape" || tool === "line" || tool === "pen") && (
          <ShapeOptions
            options={options}
            onChangeAction={onChangeAction}
            onBooleanOp={onBooleanOp}
            onPathAlign={onPathAlign}
          />
        )}
        {/* Extend: add components for fill/gradient/clone/smudge/etc. */}
      </div>
    </div>
  );
}
