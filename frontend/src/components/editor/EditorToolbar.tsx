// src/components/editor/EditorToolbar.tsx
"use client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Tool = "move" | "text" | "shape" | "crop" | "bg" | "generate";

export default function EditorToolbar({
  active,
  onChange,
  onGenerate,
}: {
  active: Tool;
  onChange: (t: Tool) => void;
  onGenerate: () => void;
}) {
  const tools: Tool[] = ["move", "text", "shape", "crop", "bg", "generate"];
  return (
    <div className="sticky top-0 z-10 flex gap-2 p-2 border-b bg-background">
      {tools.map((t) => (
        <Button
          key={t}
          variant={active === t ? "default" : "secondary"}
          className={cn("capitalize")}
          onClick={() => (t === "generate" ? onGenerate() : onChange(t))}
        >
          {t}
        </Button>
      ))}
    </div>
  );
}
