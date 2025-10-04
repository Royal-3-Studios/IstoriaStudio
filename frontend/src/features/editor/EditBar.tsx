// src/components/editor/EditBar.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

import { ToolsToolbar } from "@/components/editor/tools/ToolsToolbar";
import { ToolOptionsDock } from "@/components/editor/tools/ToolOptionsDock";
import { useEditorTools } from "@/components/editor/context/EditorToolsProvider";

type Props = {
  // zoomPercent multiplies your autoscale base (1 = fit)
  zoomPercent: number; // e.g., 1 = 100%
  onZoomInAction: () => void;
  onZoomOutAction: () => void;
  onZoomToAction: (n: number) => void; // set zoomPercent directly (1.25 = 125%)
  onFitAction: () => void; // set zoomPercent = 1
  onFill?: () => void; // optional: set zoomPercent to “fill”
  onResetToPreset?: () => void; // optional: use starting scale
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
  // ===== Global tools state from provider =====
  const { state, dispatch } = useEditorTools(); // { active, open, options }

  // ===== Zoom state (your original) =====
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

  // Shortcuts: Cmd/Ctrl +/- ; Cmd/Ctrl+0 fit ; Cmd/Ctrl+1 100% ; Esc closes dock
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        onZoomInAction();
        return;
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        onZoomOutAction();
        return;
      }
      if (mod && e.key === "0") {
        e.preventDefault();
        onFitAction();
        return;
      }
      if (mod && e.key === "1") {
        e.preventDefault();
        onZoomToAction(1);
        return;
      }
      if (e.key === "Escape" && state.open) {
        e.preventDefault();
        dispatch({ type: "CLOSE" });
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    onZoomInAction,
    onZoomOutAction,
    onFitAction,
    onZoomToAction,
    state.open,
    dispatch,
  ]);

  // Positioning context for floating sheet
  const barWrapRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      className={[
        // solid (no translucency)
        "sticky top-0 z-[140] w-full border-b bg-background",
        className || "",
      ].join(" ")}
    >
      {/* Width container + positioning for overlay */}
      <div className="mx-auto max-w-[1200px] px-3">
        <div ref={barWrapRef} className="relative">
          {/* ===== Top row: tools + zoom + actions ===== */}
          <div className="flex items-center gap-2 py-2">
            {/* Tools toolbar (left) — toggles handled in provider */}
            <ToolsToolbar className="mr-2" />

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

            {/* Right-side space for future toggles (snap/grid/guides etc.) */}
            <div className="ml-auto flex items-center gap-2">{/* … */}</div>
          </div>

          {/* ===== Floating Options Dock (OVERLAY, solid) ===== */}
          {state.open && state.active && (
            <div className="absolute left-0 right-0 top-full mt-1 z-[150]">
              <ToolOptionsDock
                open
                tool={state.active}
                options={state.options}
                onChangeAction={(patch) =>
                  dispatch({ type: "PATCH_OPTIONS", patch })
                }
                onCloseAction={() => dispatch({ type: "CLOSE" })}
                // Optional callbacks if you need them later:
                onBooleanOp={(op) => console.log("boolean op:", op)}
                onPathAlign={(align) => console.log("align:", align)}
              />
            </div>
          )}

          {/* (Optional) click-away scrim below the dock, within the bar width.
              Remove if you don't want click-away to close it. */}
          {/* {state.open && state.active && (
            <div
              className="absolute left-0 right-0 top-[calc(100%+0.5rem)] bottom-[-2rem] z-[140]"
              onClick={() => dispatch({ type: "CLOSE" })}
              aria-hidden="true"
            />
          )} */}
        </div>
      </div>
    </div>
  );
}
