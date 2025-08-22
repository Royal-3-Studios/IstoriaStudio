// src/app/projects/[projectId]/components/CanvasBackgroundToggle.tsx

"use client";
import { Button } from "@/components/ui/button";

type Props = {
  value: "white" | "black";
  onChangeAction: (v: "white" | "black") => void;
  className?: string;
};

export default function CanvasBackgroundToggle({
  value,
  onChangeAction,
  className,
}: Props) {
  return (
    <div
      className={[
        "pointer-events-auto z-10 transition-all duration-300 ease-out absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5",
        className,
      ].join(" ")}
    >
      <Button
        size="sm"
        variant={value === "white" ? "secondary" : "outline"}
        className="h-6 sm:h-8 rounded-full text-xs sm:text-sm"
        onClick={() => onChangeAction("white")}
        aria-label="White background"
      >
        White
      </Button>
      <Button
        size="sm"
        variant={value === "black" ? "secondary" : "outline"}
        className="h-6 sm:h-8 rounded-full text-xs sm:text-sm"
        onClick={() => onChangeAction("black")}
        aria-label="Black background"
      >
        Black
      </Button>
    </div>
  );
}
