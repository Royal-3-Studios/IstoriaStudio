// src/app/projects/[projectId]/components/ZoomControls.tsx

"use client";
import { Button } from "@/components/ui/button";
import { Minus, Plus as PlusIcon } from "lucide-react";

type Props = {
  zoomPercent: number;
  onZoomInAction: () => void;
  onZoomOutAction: () => void;
  onResetAction: () => void;
  className?: string;
};

export default function ZoomControls({
  zoomPercent,
  onZoomInAction,
  onZoomOutAction,
  onResetAction,
  className,
}: Props) {
  return (
    <div
      className={[
        "pointer-events-auto z-10 transition-all duration-300 ease-out absolute left-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5",
        className,
      ].join(" ")}
    >
      <Button
        variant="outline"
        className="rounded-full cursor-pointer h-6 w-6 sm:h-8 sm:w-8"
        size="icon"
        onClick={onZoomInAction}
        aria-label="Zoom in"
      >
        <PlusIcon className="h-4 w-4" />
      </Button>
      <span className="px-2 py-1 rounded-xl text-xs bg-background/80 border tabular-nums">
        {Math.round(zoomPercent * 100)}%
      </span>
      <Button
        variant="outline"
        className="rounded-full cursor-pointer h-6 w-6 sm:h-8 sm:w-8"
        size="icon"
        onClick={onZoomOutAction}
        aria-label="Zoom out"
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="cursor-pointer"
        onClick={onResetAction}
      >
        Reset
      </Button>
    </div>
  );
}
