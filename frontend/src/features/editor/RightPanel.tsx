"use client";

import * as React from "react";
import { PanelRight } from "lucide-react";

/**
 * RightPanel — fixed-width right sidebar with a smooth open/close transition.
 * - No resizer. Just a “rail” when collapsed and a tongue toggle.
 */
export default function RightPanel({
  open,
  onToggleAction,
  width = 250,
  railWidth = 30,
  railHintText = "Design Resources",
  children,
}: {
  open: boolean;
  onToggleAction: (next: boolean) => void;
  width?: number;
  railWidth?: number;
  railHintText?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="h-full hidden lg:flex border-l bg-muted/10 relative overflow-visible transition-[width] duration-200 ease-in-out"
      style={{ width: open ? width : railWidth }}
    >
      {open ? (
        <>
          {/* Content */}
          <div className="flex-1 min-w-0 h-full">{children}</div>

          {/* Tongue toggle (hangs outside the left edge, top-aligned) */}
          <button
            type="button"
            onClick={() => onToggleAction(false)}
            title="Collapse right panel"
            aria-label="Collapse right panel"
            className={[
              "absolute z-[120] pointer-events-auto",
              "top-2 -left-8", // hang outside the left edge
            ].join(" ")}
          >
            <div className="cursor-pointer rounded-md border-none bg-background shadow px-1.5 py-1 hover:bg-muted transition">
              <PanelRight className="h-3.5 w-3.5" />
            </div>
          </button>
        </>
      ) : (
        // Collapsed rail + tongue
        <div className="relative" style={{ width: `${railWidth}px` }}>
          <button
            type="button"
            onClick={() => onToggleAction(true)}
            title="Open right panel"
            aria-label="Open right panel"
            className={[
              "absolute z-[120] pointer-events-auto",
              "top-2 -left-8", // keep outside left even when collapsed
            ].join(" ")}
          >
            <div className="cursor-pointer rounded-md border bg-background shadow px-1.5 py-1 hover:bg-muted transition">
              <PanelRight className="h-3.5 w-3.5" />
            </div>
          </button>

          {/* Vertical hint text on the rail */}
          <div
            className="absolute top-32 left-1/2 -translate-x-1/2 text-[10px] select-none"
            style={{
              writingMode: "vertical-rl",
              transform: "rotate(270deg)", // read bottom-to-top
            }}
            aria-hidden
          >
            {railHintText.split("").map((ch, i) => (
              <p key={`${ch}-${i}`} className="font-bold">
                {ch == " " ? <br /> : ch}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
