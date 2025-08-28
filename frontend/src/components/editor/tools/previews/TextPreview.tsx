// =============================================================
// src/components/editor/tools/previews/TextPreview.tsx
// =============================================================
"use client";
export function TextPreview({
  color,
  fontFamily,
  fontSize,
  fontWeight,
}: {
  color: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
}) {
  return (
    <div className="flex items-center gap-2" title="Text preview">
      <span className="text-xs text-muted-foreground">Preview</span>
      <div className="h-6 w-20 rounded bg-muted/60 flex items-center justify-center">
        <span style={{ color, fontFamily, fontSize, fontWeight }}>Ag</span>
      </div>
    </div>
  );
}
