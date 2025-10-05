// =============================================================
// src/components/editor/tools/previews/BrushPreview.tsx
// =============================================================
"use client";
export function BrushPreview({ color, size }: { color: string; size: number }) {
  const s = Math.max(4, Math.min(64, size));
  return (
    <div className="flex items-center gap-2" title={`Brush ${size}px`}>
      <span className="text-xs text-muted-foreground">Preview</span>
      <div className="h-6 w-16 rounded-full bg-muted/60 flex items-center justify-center">
        <div
          className="rounded-full"
          style={{ width: s, height: s, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
