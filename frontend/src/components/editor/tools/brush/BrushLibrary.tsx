"use client";
import { BRUSH_CATEGORIES } from "@/data/brushPresets";

export function BrushLibrary({
  activeBrushId,
  onSelectAction,
}: {
  activeBrushId: string;
  onSelectAction: (id: string) => void;
}) {
  return (
    <section className="space-y-2">
      <h4 className="text-[11px] font-medium tracking-wide text-muted-foreground">
        Brushes
      </h4>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {BRUSH_CATEGORIES.map((cat) => (
          <div key={cat.id} className="min-w-[160px]">
            <div className="text-xs font-medium mb-1">{cat.name}</div>
            <div className="grid grid-cols-1 gap-1">
              {cat.brushes.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onSelectAction(b.id)}
                  className={[
                    "w-full text-left border rounded-sm px-2 py-1 text-[12px] cursor-pointer",
                    b.id === activeBrushId
                      ? "ring-2 ring-ring"
                      : "hover:bg-accent",
                  ].join(" ")}
                  title={b.name}
                  aria-pressed={b.id === activeBrushId}
                >
                  {b.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
