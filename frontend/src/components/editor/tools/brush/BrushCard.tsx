// src/components/editor/tools/BrushCard.tsx
"use client";

import * as React from "react";
import type { BrushPreset } from "@/data/brushPresets";
import { Sun, Moon, Star } from "lucide-react";
import { drawStrokeToCanvas } from "@/lib/brush/engine";

const PREVIEW_CSS_W = 352;
const PREVIEW_CSS_H = 127;

/** Local fallback so we never crash if a preset is half-baked. */
const FALLBACK_ENGINE = {
  backend: "stamping" as const,
  strokePath: { spacing: 4, jitter: 0, scatter: 0, streamline: 20, count: 1 },
  shape: { type: "round" as const, softness: 50, sizeScale: 1 },
  grain: { kind: "none" as const, depth: 0, scale: 1 },
  rendering: { mode: "marker" as const, wetEdges: false, flow: 100 },
};

type BrushPresetWithTags = BrushPreset & { readonly tags?: readonly string[] };

export const BrushCard = React.memo(function BrushCard({
  preset,
  selected,
  onSelect,
  initialBg = "light",
  // New: favorites + tags (all optional / inert if not passed)
  isFavorite,
  onToggleFavorite,
  showTags = false,
}: {
  preset: BrushPresetWithTags;
  selected?: boolean;
  onSelect?: (id: string) => void;
  initialBg?: "light" | "dark";
  isFavorite?: boolean;
  onToggleFavorite?: (id: string, next: boolean) => void;
  showTags?: boolean;
}) {
  const [bgMode, setBgMode] = React.useState<"light" | "dark">(initialBg);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // --- Resolve a safe engine & base size ---
  const engine = preset.engine ?? FALLBACK_ENGINE;

  const sizeParam = React.useMemo(
    () => preset.params.find((p) => p.type === "size"),
    [preset.params]
  );

  const baseSizePx = React.useMemo(() => {
    const ui = Number(sizeParam?.defaultValue ?? 12);
    const scale = engine.shape?.sizeScale ?? 1;
    const px = Math.round(ui * scale);
    return Math.max(2, Math.min(28, px)); // small for perf
  }, [sizeParam, engine.shape?.sizeScale]);

  // --- Backing store sizing for crispness ---
  const pixelRatio = 2; // keep deterministic previews
  React.useLayoutEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = Math.max(1, Math.round(PREVIEW_CSS_W * pixelRatio));
    c.height = Math.max(1, Math.round(PREVIEW_CSS_H * pixelRatio));
  }, [pixelRatio]);

  // --- Deterministic S-curve path (within bounds) ---
  const path = React.useMemo(() => {
    const w = PREVIEW_CSS_W;
    const h = PREVIEW_CSS_H;

    const scatterPct = (engine.strokePath?.scatter ?? 0) / 100;
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
      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      pts.push({ x, y, angle: angleDeg });
    }
    return pts;
  }, [baseSizePx, engine.strokePath?.scatter]);

  // --- Stable seed per brush id ---
  const seed = React.useMemo(
    () => preset.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0),
    [preset.id]
  );

  // --- Keep strokes compact for preview row (spacing as fraction of diameter) ---
  // We'll convert to PERCENT when installing onto the engine (recommended).
  const spacingFrac = React.useMemo(() => {
    const uiSpacing = engine.strokePath?.spacing ?? 6;
    const raw =
      typeof uiSpacing === "number"
        ? uiSpacing > 1
          ? uiSpacing / 100
          : uiSpacing
        : 0.06;
    return Math.max(0.01, Math.min(0.35, raw));
  }, [engine.strokePath?.spacing]);

  // Build a preview-specific engine that uses percent spacing (what backends expect)
  const previewEngine = React.useMemo(() => {
    return {
      ...engine,
      strokePath: {
        ...engine.strokePath,
        spacing: Math.round(spacingFrac * 100), // percent, e.g. 6 = 6%
      },
    };
  }, [engine, spacingFrac]);

  // --- Render preview ---
  React.useEffect(() => {
    const el = canvasRef.current;
    if (!el || path.length === 0) return;

    void drawStrokeToCanvas(el, {
      engine: previewEngine,
      baseSizePx,
      color: "#000000",
      width: PREVIEW_CSS_W,
      height: PREVIEW_CSS_H,
      pixelRatio,
      seed,
      path,
      overrides: {
        centerlinePencil: true, // nice rim for graphite looks; harmless otherwise
        flow: 100,
        // NOTE: do NOT pass spacing here; we set it on engine.strokePath (percent)
      },
    });
  }, [previewEngine, baseSizePx, seed, path, pixelRatio]);

  // --- UI bits ---
  const title = preset.name;
  const subtitle = preset.subtitle ?? "";
  const bgStyle: React.CSSProperties = {
    backgroundColor: bgMode === "dark" ? "#111827" : "#ffffff",
  };
  const tags = (preset.tags ?? []) as readonly string[];

  const handleActivate = React.useCallback(() => {
    onSelect?.(preset.id);
  }, [onSelect, preset.id]);

  const handleToggleFavorite = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!onToggleFavorite) return;
      const next = !isFavorite;
      onToggleFavorite(preset.id, next);
    },
    [onToggleFavorite, isFavorite, preset.id]
  );

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
      aria-pressed={!!selected}
      onClick={handleActivate}
      onKeyDown={(e) => e.key === "Enter" && handleActivate()}
      tabIndex={0}
      aria-label={subtitle ? `${title} — ${subtitle}` : title}
      style={{ width: "100%", height: 146 }}
      title={title}
    >
      {/* background */}
      <div className="absolute inset-0" style={bgStyle} />

      {/* preview */}
      <div className="absolute inset-x-0 top-0 flex justify-center pt-0">
        <canvas
          ref={canvasRef}
          className="block"
          style={{ width: PREVIEW_CSS_W, height: PREVIEW_CSS_H }}
        />
      </div>

      {/* footer */}
      <div className="absolute inset-x-0 bottom-0 p-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-xs font-medium">{title}</div>
            {subtitle && (
              <div className="truncate text-[10px] opacity-80">{subtitle}</div>
            )}
            {showTags && tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {tags.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="rounded-full border px-1.5 py-0.5 text-[10px] opacity-80"
                    title={t}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Favorite star (optional) */}
            {onToggleFavorite && (
              <button
                type="button"
                onClick={handleToggleFavorite}
                className={[
                  "rounded-md border px-1.5 py-1 text-[10px] transition",
                  isFavorite
                    ? "border-yellow-500/60 bg-yellow-500/10"
                    : "opacity-80 hover:opacity-100",
                ].join(" ")}
                aria-pressed={!!isFavorite}
                aria-label={isFavorite ? "Unfavorite brush" : "Favorite brush"}
                title={isFavorite ? "Unfavorite" : "Favorite"}
              >
                <Star
                  className="h-3.5 w-3.5"
                  {...(isFavorite ? { fill: "currentColor" } : {})}
                />
              </button>
            )}

            {/* BG toggle */}
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
    </div>
  );
});
