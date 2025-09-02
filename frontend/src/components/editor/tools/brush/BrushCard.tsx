// src/components/editor/tools/BrushCard.tsx
"use client";
import * as React from "react";
import type { BrushPreset } from "@/data/brushPresets";
import { Sun, Moon } from "lucide-react";
import { drawStrokeToCanvas } from "@/lib/brush/engine";

const DEFAULT_CHARCOAL = "#1a1a1a";

export const BrushCard = React.memo(function BrushCard({
  preset,
  selected,
  onSelect,
  initialBg = "light",
}: {
  preset: BrushPreset;
  selected?: boolean;
  onSelect?: (id: string) => void;
  initialBg?: "light" | "dark";
}) {
  const [bgMode, setBgMode] = React.useState<"light" | "dark">(initialBg);

  // Base size from the preset (kept small for cards so we don't overflow)
  const sizeParam = preset.params.find((p) => p.type === "size");
  const baseSizePx = Math.max(
    2,
    Math.min(
      28,
      Number(sizeParam?.defaultValue ?? 12) *
        (preset.engine.shape.sizeScale ?? 1)
    )
  );

  // --- Measure preview area (no ML/MR hacks) ---
  const previewRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [previewSize, setPreviewSize] = React.useState({ w: 0, h: 0 });

  React.useLayoutEffect(() => {
    if (!previewRef.current) return;
    const el = previewRef.current;
    const ro = new ResizeObserver(() => {
      const w = Math.floor(el.clientWidth);
      // nice aspect for a stroke strip; tall enough for big tips
      const h = Math.max(60, Math.floor(w * 0.55));
      setPreviewSize({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build a path with SAFE INSET so stamps never hit the edges
  const path = React.useMemo(() => {
    const { w, h } = previewSize;
    if (!w || !h) return null;

    // Estimate worst-case outward reach:
    // - radius ~ baseSize/2
    // - scatter adds up to ~0.6 * baseSize
    // - a little jitter + anti-aliased soft edge safety
    // Estimate worst-case outward reach
    const scatterPct = (preset.engine.strokePath.scatter ?? 0) / 100;
    const worstScatter = baseSizePx * 0.6 * scatterPct;
    const radius = baseSizePx * 0.6; // slightly conservative
    const INSET = Math.ceil(radius + worstScatter + 8);

    // --- add a display shrink of ~10% (5% each side) ---
    const SHRINK = 0.1;
    const extraX = Math.round(previewSize.w * SHRINK * 0.5);
    const extraY = Math.round(previewSize.h * SHRINK * 0.5);

    // use let so we can add extra padding
    const left = Math.max(6, INSET) + extraX;
    const right = Math.max(6, INSET) + extraX;
    // if your right side still nudges the edge, add +1 here:  + extraX + 1
    const top = Math.max(6, INSET) + extraY;
    const bottom = Math.max(6, INSET) + extraY;

    const x0 = left;
    const x1 = Math.max(x0 + 1, w - right);
    const midY = Math.floor(h * 0.55);

    // amplitude respects the new vertical insets
    const amp = Math.max(6, Math.min((h - top - bottom) * 0.38, 32));

    const pts: { x: number; y: number; angle: number }[] = [];
    const STEPS = 44;
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS;
      const x = x0 + (x1 - x0) * t;
      const y = midY - amp * t + amp * 0.45 * Math.sin(6.5 * t);
      const dx = (x1 - x0) / STEPS;
      const dy = -amp / STEPS + (amp * 0.45 * 6.5 * Math.cos(6.5 * t)) / STEPS;
      pts.push({ x, y, angle: Math.atan2(dy, dx) });
    }
    return pts;
  }, [previewSize, baseSizePx, preset.engine.strokePath.scatter]);

  // Deterministic seed per brush id
  const seed = React.useMemo(
    () => preset.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0),
    [preset.id]
  );

  // Draw whenever size, bg, or preset changes
  React.useEffect(() => {
    const el = canvasRef.current;
    if (!el || !path) return;
    drawStrokeToCanvas(el, {
      engine: preset.engine,
      baseSizePx,
      // color: userPickedColorHex || DEFAULT_CHARCOAL,
      color: DEFAULT_CHARCOAL,
      width: previewSize.w,
      height: previewSize.h,
      seed,
      path, // <- use our safe-inset path
      colorJitter: { h: 2, s: 2, l: 1, perStamp: true },
      overrides: { centerlinePencil: true },
    });
  }, [
    preset.engine,
    baseSizePx,
    bgMode,
    seed,
    path,
    previewSize.w,
    previewSize.h,
  ]);

  const title = preset.name;
  const subtitle = preset.subtitle ?? "";
  const bgStyle: React.CSSProperties = {
    backgroundColor: bgMode === "dark" ? "#111827" : "#ffffff",
  };

  return (
    <div
      className={[
        "relative select-none overflow-hidden rounded-xl border transition",
        selected
          ? "ring-2 ring-primary border-primary/50"
          : "hover:border-muted-foreground/40",
        bgMode === "light" ? "text-black" : "text-white",
      ].join(" ")}
      role="button"
      aria-pressed={selected}
      onClick={() => onSelect?.(preset.id)}
      onKeyDown={(e) => e.key === "Enter" && onSelect?.(preset.id)}
      tabIndex={0}
      aria-label={subtitle ? `${title} — ${subtitle}` : title}
      style={{ width: 160, height: 120 }}
      title={title}
    >
      {/* background */}
      <div className="absolute inset-0" style={bgStyle} />

      {/* preview area: padded; we measure THIS box */}
      <div
        ref={previewRef}
        className="absolute left-2 right-0 top-0 p-0 ml-[-10px]"
      >
        <div
          className="relative w-full"
          style={{ height: previewSize.h || 64 }}
        >
          <canvas ref={canvasRef} className="absolute inset-0 block" />
        </div>
      </div>

      {/* text footer */}
      <div className="absolute inset-x-0 bottom-0 p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-xs font-medium">{title}</div>
            {!!subtitle && (
              <div className="truncate text-[10px] opacity-80">{subtitle}</div>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setBgMode((m) => (m === "light" ? "dark" : "light"));
            }}
            className="rounded-md border px-1.5 py-1 text-[10px] opacity-80 hover:opacity-100"
            aria-label={
              bgMode === "light"
                ? "Switch to dark background"
                : "Switch to light background"
            }
            title={
              bgMode === "light"
                ? "Switch to dark background"
                : "Switch to light background"
            }
          >
            {bgMode === "light" ? (
              <Moon className="h-3.5 w-3.5" />
            ) : (
              <Sun className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
});
