// =============================================================
// src/components/editor/tools/previews/LinePreview.tsx
// =============================================================
"use client";
export function LinePreview({
  color,
  width,
}: {
  color: string;
  width: number;
}) {
  const w = Math.max(1, Math.min(12, width));
  return (
    <div className="flex items-center gap-2" title={`Stroke ${width}px`}>
      <span className="text-xs text-muted-foreground">Preview</span>
      <div className="h-6 w-16 rounded-full bg-muted/60 flex items-center justify-center">
        <div className="w-12" style={{ height: w, backgroundColor: color }} />
      </div>
    </div>
  );
}
