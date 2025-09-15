// src/components/editor/tools/BrushCard.tsx
"use client";
import * as React from "react";
import type { BrushPreset } from "@/data/brushPresets";
import { Sun, Moon } from "lucide-react";
import { drawStrokeToCanvas } from "@/lib/brush/engine";

const PREVIEW_W = 352;
const PREVIEW_H = 127;

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

  // Base size from the preset (kept modest for cards)
  const sizeParam = preset.params.find((p) => p.type === "size");
  const baseSizePx = Math.max(
    2,
    Math.min(
      28,
      Number(sizeParam?.defaultValue ?? 12) *
        (preset.engine.shape?.sizeScale ?? 1) // <- optional chaining
    )
  );

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // Fixed-dimension S curve like Procreate preview
  const path = React.useMemo(() => {
    const w = PREVIEW_W;
    const h = PREVIEW_H;

    const scatterPct = (preset.engine.strokePath?.scatter ?? 0) / 100; // <- optional chaining
    const radius = baseSizePx * 0.5;
    const worstScatter = baseSizePx * 0.5 * scatterPct;

    const INSET_X = Math.ceil(
      Math.max(8, radius * 0.8 + worstScatter * 0.6 + 4)
    );
    const INSET_Y = Math.ceil(Math.max(8, radius * 0.5 + 4));

    const x0 = INSET_X;
    const x1 = Math.max(x0 + 1, w - INSET_X);
    const usableH = Math.max(1, h - INSET_Y * 2);

    const midY = Math.floor(h * 0.58);
    const amp = Math.min(usableH * 0.26, 22);
    const freq = 5.2;
    const wiggle = 0.34;
    const steps = 60;

    const pts: { x: number; y: number; angle: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = midY - amp * (t - 0.5) + amp * wiggle * Math.sin(freq * t);
      const dx = (x1 - x0) / steps;
      const dy =
        -amp / steps + (amp * wiggle * freq * Math.cos(freq * t)) / steps;
      pts.push({ x, y, angle: Math.atan2(dy, dx) });
    }
    return pts;
  }, [baseSizePx, preset.engine.strokePath?.scatter]); // <- safe dep

  // Deterministic seed per brush id
  const seed = React.useMemo(
    () => preset.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0),
    [preset.id]
  );

  const spacingOverride =
    (preset.engine.strokePath?.spacing ?? 6) / Math.max(1, baseSizePx * 0.5); // <- optional chaining

  // Draw on change
  React.useEffect(() => {
    const el = canvasRef.current;
    if (!el || !path) return;
    drawStrokeToCanvas(el, {
      engine: preset.engine,
      baseSizePx,
      color: "#000000",
      width: 352,
      height: 127,
      pixelRatio: 2,
      seed,
      path,
      colorJitter: undefined,
      overrides: {
        centerlinePencil: true,
        flow: 100,
        spacing: spacingOverride,
      },
    });
  }, [preset.engine, baseSizePx, seed, path, spacingOverride]);

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
      style={{ width: "100%", height: 132 }}
      title={title}
    >
      {/* background */}
      <div className="absolute inset-0" style={bgStyle} />

      {/* fixed-size preview centered at top */}
      <div className="absolute inset-x-0 top-0 flex justify-center pt-0">
        <canvas
          ref={canvasRef}
          className="block"
          style={{ width: PREVIEW_W, height: PREVIEW_H }}
        />
      </div>

      {/* text footer */}
      {/* <div className="absolute inset-x-0 bottom-0 p-2">
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
      </div> */}
    </div>
  );
});
