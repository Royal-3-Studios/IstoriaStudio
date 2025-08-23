// ZoomControls.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Minus, Plus as PlusIcon, RotateCcw } from "lucide-react";

type Props = {
  zoomPercent: number; // 1 = 100%
  onZoomInAction: () => void;
  onZoomOutAction: () => void;
  onResetAction: () => void;
  onZoomToAction?: (nextPercent: number) => void; // e.g., 1.25 for 125%
  className?: string;
  attach?: "container" | "viewport"; // NEW: default "container"
};

// Dimensions
const PANEL_W = 260; // full width (px)
const TONGUE_W = 36; // collapsed visible width (px)

const MIN_PCT = 5;
const MAX_PCT = 500;

export default function ZoomControls({
  zoomPercent,
  onZoomInAction,
  onZoomOutAction,
  onResetAction,
  onZoomToAction,
  className,
  attach = "container",
}: Props) {
  const [open, setOpen] = useState(false);

  const pct = useMemo(() => Math.round(zoomPercent * 100), [zoomPercent]);
  const [inputPct, setInputPct] = useState<string>(String(pct));
  useEffect(() => setInputPct(String(pct)), [pct]);

  const commitInput = () => {
    if (!onZoomToAction) return;
    const n = Number(inputPct);
    if (Number.isFinite(n)) {
      const clamped = Math.max(MIN_PCT, Math.min(MAX_PCT, n));
      onZoomToAction(clamped / 100);
      setInputPct(String(Math.round(clamped)));
    } else {
      setInputPct(String(pct));
    }
  };

  // choose positioning strategy
  const positionClass =
    attach === "viewport"
      ? "fixed left-0 top-1/2 -translate-y-1/2"
      : "absolute left-0 top-1/2 -translate-y-1/2";

  return (
    <div
      className={[
        "pointer-events-auto z-[200]", // big enough to sit above canvas
        positionClass,
        className || "",
      ].join(" ")}
      onMouseLeave={() => setOpen(false)}
      style={{ width: open ? PANEL_W : TONGUE_W }}
    >
      {/* Right-aligned panel: tongue always visible when collapsed */}
      <div className="flex justify-end transition-[width] duration-300 ease-out">
        <div className="flex w-[260px] items-stretch overflow-hidden rounded-r-xl border bg-background/90 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/70">
          {/* Controls block (hidden by wrapper when collapsed) */}
          <div className="flex items-center gap-2 p-2 pr-0">
            <div className="flex flex-col items-center gap-1">
              <Button
                variant="outline"
                className="rounded-full cursor-pointer h-7 w-7 sm:h-8 sm:w-8"
                size="icon"
                onClick={onZoomInAction}
                aria-label="Zoom in"
                title="Zoom in"
              >
                <PlusIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="rounded-full cursor-pointer h-7 w-7 sm:h-8 sm:w-8"
                size="icon"
                onClick={onZoomOutAction}
                aria-label="Zoom out"
                title="Zoom out"
              >
                <Minus className="h-4 w-4" />
              </Button>
            </div>

            {/* numeric input (percent) */}
            <div className="ml-2 mr-1 flex items-center gap-2">
              <div className="relative">
                <Input
                  inputMode="numeric"
                  type="number"
                  min={MIN_PCT}
                  max={MAX_PCT}
                  step={1}
                  value={inputPct}
                  onChange={(e) => setInputPct(e.target.value)}
                  onBlur={commitInput}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      (e.target as HTMLInputElement).blur();
                  }}
                  disabled={!onZoomToAction}
                  className="w-20 pr-8"
                  aria-label="Zoom percentage"
                  title="Enter zoom percentage"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  %
                </span>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="cursor-pointer h-8 w-8"
                onClick={onResetAction}
                aria-label="Reset zoom"
                title="Reset zoom"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Tongue (right end-cap) — the only hover/click trigger */}
          <button
            type="button"
            aria-label={open ? "Hide zoom controls" : "Show zoom controls"}
            aria-expanded={open}
            title="Zoom"
            onMouseEnter={() => setOpen(true)} // hover to open
            onClick={() => setOpen((v) => !v)} // click to toggle
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setOpen((v) => !v);
              }
            }}
            className="grid place-items-center border-l bg-primary/90 text-primary-foreground px-1 cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-primary"
            style={{ width: TONGUE_W }}
          >
            <span
              className="text-[10px] font-semibold"
              style={{
                writingMode: "vertical-rl",
                textOrientation: "mixed",
                letterSpacing: "0.12em",
              }}
            >
              Z O O M
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
