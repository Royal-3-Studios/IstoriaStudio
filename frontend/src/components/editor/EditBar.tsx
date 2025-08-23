"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Minus,
  Plus as PlusIcon,
  RotateCcw,
  Maximize2,
  Minimize2,
  Percent,
} from "lucide-react";

type Props = {
  // zoomPercent multiplies your autoscale base (1 = fit)
  zoomPercent: number; // e.g., 1 = 100%
  onZoomInAction: () => void;
  onZoomOutAction: () => void;
  onZoomToAction: (n: number) => void; // set zoomPercent directly (1.25 = 125%)
  onFitAction: () => void; // set zoomPercent = 1
  onFill?: () => void; // optional: set zoomPercent to “fill” (if you compute it)
  onResetToPreset?: () => void; // optional: use starting_scale
  className?: string;
};

// limits for typed %
const MIN_PCT = 5;
const MAX_PCT = 500;

export default function EditBar({
  zoomPercent,
  onZoomInAction,
  onZoomOutAction,
  onZoomToAction,
  onFitAction,
  onFill,
  onResetToPreset,
  className,
}: Props) {
  // Keep input in sync with external zoom
  const pct = useMemo(() => Math.round(zoomPercent * 100), [zoomPercent]);
  const [inputPct, setInputPct] = useState(String(pct));
  useEffect(() => setInputPct(String(pct)), [pct]);

  const commitPercent = () => {
    const n = Number(inputPct);
    if (!Number.isFinite(n)) return setInputPct(String(pct));
    const clamped = Math.max(MIN_PCT, Math.min(MAX_PCT, n));
    onZoomToAction(clamped / 100);
    setInputPct(String(Math.round(clamped)));
  };

  // Handy shortcuts (Cmd/Ctrl + / -, Cmd/Ctrl+0 for Fit, Cmd/Ctrl+1 for 100%)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        onZoomInAction();
      }
      if (e.key === "-") {
        e.preventDefault();
        onZoomOutAction();
      }
      if (e.key === "0") {
        e.preventDefault();
        onFitAction();
      }
      if (e.key === "1") {
        e.preventDefault();
        onZoomToAction(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onZoomInAction, onZoomOutAction, onFitAction, onZoomToAction]);

  return (
    <div
      className={[
        "sticky top-0 z-30 w-full border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70",
        className || "",
      ].join(" ")}
    >
      <div className="mx-auto flex max-w-[1200px] items-center gap-2 px-3 py-2">
        {/* Left cluster: (future) Edit tools placeholders */}
        {/* <Button variant="ghost" size="sm">Undo</Button>
        <Button variant="ghost" size="sm">Redo</Button>
        <Separator orientation="vertical" className="mx-1 h-6" /> */}

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full cursor-pointer"
            onClick={onZoomOutAction}
            aria-label="Zoom out"
            title="Zoom out (Ctrl/Cmd -)"
          >
            <Minus className="h-4 w-4" />
          </Button>

          <div className="relative">
            <Input
              inputMode="numeric"
              type="number"
              min={MIN_PCT}
              max={MAX_PCT}
              step={1}
              value={inputPct}
              onChange={(e) => setInputPct(e.target.value)}
              onBlur={commitPercent}
              onKeyDown={(e) =>
                e.key === "Enter" && (e.target as HTMLInputElement).blur()
              }
              className="h-8 w-20 pr-7"
              aria-label="Zoom percentage"
              title="Enter zoom percentage"
            />
            <Percent className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 opacity-60" />
          </div>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 rounded-full cursor-pointer"
            onClick={onZoomInAction}
            aria-label="Zoom in"
            title="Zoom in (Ctrl/Cmd +)"
          >
            <PlusIcon className="h-4 w-4" />
          </Button>
        </div>

        {/* Fit / Fill / 100% / Reset-to-preset */}
        <div className="ml-2 flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer"
            onClick={onFitAction}
            aria-label="Fit to view"
            title="Fit (Ctrl/Cmd 0)"
          >
            <Minimize2 className="mr-1 h-4 w-4" /> Fit
          </Button>

          {onFill && (
            <Button
              variant="ghost"
              size="sm"
              className="cursor-pointer"
              onClick={onFill}
              aria-label="Fill view"
              title="Fill"
            >
              <Maximize2 className="mr-1 h-4 w-4" /> Fill
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="cursor-pointer"
            onClick={() => onZoomToAction(1)}
            aria-label="100 percent"
            title="Actual size (Ctrl/Cmd 1)"
          >
            100%
          </Button>

          {onResetToPreset && (
            <>
              <Separator orientation="vertical" className="mx-1 h-6" />
              <Button
                variant="ghost"
                size="sm"
                className="cursor-pointer"
                onClick={onResetToPreset}
                aria-label="Reset to preset"
                title="Reset to preset starting scale"
              >
                <RotateCcw className="mr-1 h-4 w-4" /> Preset
              </Button>
            </>
          )}
        </div>

        {/* Right side space for other edit features: snapping, guides, rulers, align, etc. */}
        <div className="ml-auto flex items-center gap-2">
          {/* <Toggle>Snap</Toggle>
          <Toggle>Guides</Toggle>
          <Toggle>Grid</Toggle> */}
        </div>
      </div>
    </div>
  );
}
