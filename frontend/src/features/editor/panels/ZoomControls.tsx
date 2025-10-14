// src/features/editor/panels/ZoomControls.tsx
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Minus, Plus as PlusIcon, RotateCcw } from "lucide-react";
import { useEditorStore } from "../store/editor.store";

type BaseProps = {
  className?: string;
  attach?: "container" | "viewport";
};

// Controlled (legacy) API
type ControlledProps = BaseProps & {
  /** Zoom scale (1 = 100%). */
  zoomPercent: number;
  onZoomInAction: () => void;
  onZoomOutAction: () => void;
  onResetAction: () => void;
  /** Optional: jump to a specific zoom scale (e.g., 1.25 for 125%). */
  onZoomToAction?: (nextPercent: number) => void;
};

// Store-driven (new) API
type StoreProps = BaseProps;

type Props = ControlledProps | StoreProps;

const PANEL_W = 260;
const TONGUE_W = 36;
const MIN_PCT = 5;
const MAX_PCT = 500;

export default function ZoomControls(props: Props): React.ReactElement {
  const { className, attach = "container" } = props;

  // Decide mode by feature detection (safe discriminant for union)
  const isControlled = "onZoomInAction" in props;

  // Store hooks (always safe to call unconditionally)
  const storeZoom = useEditorStore((s) => s.viewport.zoom);
  const storeSetZoom = useEditorStore((s) => s.setZoom);
  const storeZoomIn = useEditorStore((s) => s.zoomIn);
  const storeZoomOut = useEditorStore((s) => s.zoomOut);
  const storeResetZoom = useEditorStore((s) => s.resetZoom);

  // Narrow to controlled if applicable
  const controlled = isControlled ? (props as ControlledProps) : null;

  // Effective zoom scale (1 = 100%)
  const effectiveZoom: number = controlled ? controlled.zoomPercent : storeZoom;

  // Derived % for the input (clamped for display)
  const pctNumber: number = Math.max(
    MIN_PCT,
    Math.min(MAX_PCT, Math.round(effectiveZoom * 100))
  );

  // UI state
  const [open, setOpen] = React.useState<boolean>(false);
  const [inputPct, setInputPct] = React.useState<string>(String(pctNumber));

  // Keep input in sync with external zoom updates
  React.useEffect(() => {
    setInputPct(String(pctNumber));
  }, [pctNumber]);

  // Button actions (controlled vs store)
  const doZoomIn = controlled ? controlled.onZoomInAction : storeZoomIn;
  const doZoomOut = controlled ? controlled.onZoomOutAction : storeZoomOut;
  const doReset = controlled ? controlled.onResetAction : storeResetZoom;
  const onZoomToAction = controlled?.onZoomToAction;

  const handleZoomIn = React.useCallback(() => {
    // cast away the optional numeric param in store mode
    (doZoomIn as (step?: number) => void)();
  }, [doZoomIn]);

  const handleZoomOut = React.useCallback(() => {
    (doZoomOut as (step?: number) => void)();
  }, [doZoomOut]);

  const handleReset = React.useCallback(() => {
    doReset();
  }, [doReset]);

  const commitInput = React.useCallback((): void => {
    // Accept "" as “revert to external value”
    if (inputPct.trim() === "") {
      setInputPct(String(pctNumber));
      return;
    }
    const n = Number(inputPct);
    if (Number.isFinite(n)) {
      const clamped = Math.max(MIN_PCT, Math.min(MAX_PCT, n));
      const asScale = clamped / 100;
      if (onZoomToAction) onZoomToAction(asScale);
      else storeSetZoom(asScale);
      setInputPct(String(Math.round(clamped)));
    } else {
      setInputPct(String(pctNumber));
    }
  }, [inputPct, pctNumber, onZoomToAction, storeSetZoom]);

  const positionClass =
    attach === "viewport"
      ? "fixed left-0 top-1/2 -translate-y-1/2"
      : "absolute left-0 top-1/2 -translate-y-1/2";

  return (
    <div
      className={[
        "pointer-events-auto z-[200]",
        positionClass,
        className || "",
      ].join(" ")}
      onMouseLeave={(): void => setOpen(false)}
      style={{ width: open ? PANEL_W : TONGUE_W }}
    >
      <div className="flex justify-end transition-[width] duration-300 ease-out">
        <div className="flex w-[260px] items-stretch overflow-hidden rounded-r-xl border bg-background/90 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/70">
          {/* Controls block */}
          <div className="flex items-center gap-2 p-2 pr-0">
            <div className="flex flex-col items-center gap-1">
              <Button
                variant="outline"
                className="rounded-full cursor-pointer h-7 w-7 sm:h-8 sm:w-8"
                size="icon"
                onClick={handleZoomIn}
                aria-label="Zoom in"
                title="Zoom in"
              >
                <PlusIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="rounded-full cursor-pointer h-7 w-7 sm:h-8 sm:w-8"
                size="icon"
                onClick={handleZoomOut}
                aria-label="Zoom out"
                title="Zoom out"
              >
                <Minus className="h-4 w-4" />
              </Button>
            </div>

            {/* Percent input */}
            <div className="ml-2 mr-1 flex items-center gap-2">
              <div className="relative">
                <Input
                  inputMode="numeric"
                  type="text"
                  value={inputPct}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
                    // Allow digits only (and empty while editing)
                    const v = e.target.value;
                    if (/^\d*$/.test(v)) setInputPct(v);
                  }}
                  onBlur={commitInput}
                  onKeyDown={(
                    e: React.KeyboardEvent<HTMLInputElement>
                  ): void => {
                    if (e.key === "Enter")
                      (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") {
                      setInputPct(String(pctNumber));
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className="w-20 pr-8"
                  aria-label="Zoom percentage"
                  title="Enter zoom percentage"
                  placeholder={`${pctNumber}`}
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  %
                </span>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="cursor-pointer h-8 w-8"
                onClick={doReset}
                aria-label="Reset zoom"
                title="Reset zoom"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Tongue */}
          <button
            type="button"
            aria-label={open ? "Hide zoom controls" : "Show zoom controls"}
            aria-expanded={open}
            title="Zoom"
            onMouseEnter={(): void => setOpen(true)}
            onClick={(): void => setOpen((v) => !v)}
            onKeyDown={(e: React.KeyboardEvent<HTMLButtonElement>): void => {
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
