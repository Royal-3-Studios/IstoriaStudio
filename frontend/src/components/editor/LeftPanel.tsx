// src/components/editor/LeftPanel.tsx
"use client";

import * as React from "react";
import { PanelLeft } from "lucide-react";
import LeftSidebar from "@/components/editor/LeftSidebar";

type Asset = {
  id: string;
  label: string;
  width: number;
  height: number;
  thumbUrl?: string; // optional thumbnail support (future)
};

export default function LeftPanel({
  open,
  onToggleAction,
  assets,
  activeAssetId,
  onSelectAssetAction,
  openWidth = 200,
  railWidth = 30,
  collapsedLabel,
}: {
  open: boolean;
  onToggleAction: (next: boolean) => void;
  assets: Asset[];
  activeAssetId?: string | null;
  onSelectAssetAction?: (id: string) => void;
  openWidth?: number;
  railWidth?: number;
  collapsedLabel?: React.ReactNode;
}) {
  return (
    <div
      className="h-full hidden lg:flex border-r bg-muted/20 relative overflow-visible transition-[width] duration-200 ease-in-out z-40"
      style={{ width: open ? openWidth : railWidth }}
    >
      {open ? (
        <>
          <LeftSidebar
            assets={assets}
            activeAssetId={activeAssetId ?? null}
            onSelectAction={onSelectAssetAction}
          />
          {/* Tongue overlay strip that sits ABOVE the grid seam */}
          <EdgeTongue side="left" onClick={() => onToggleAction(false)} />
        </>
      ) : (
        <div className="relative h-full w-full overflow-visible">
          <EdgeTongue side="left" onClick={() => onToggleAction(true)} />
          <RailLabel collapsedLabel={collapsedLabel} />
        </div>
      )}
    </div>
  );
}

function EdgeTongue({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: () => void;
}) {
  const isLeft = side === "left";

  return (
    // This strip extends ~8px over the seam so the button is always clickable.
    <div
      className={[
        "absolute inset-y-0",
        isLeft ? "right-0" : "left-0",
        "w-8 pointer-events-none z-[120]",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onClick}
        title="Toggle left panel"
        aria-label="Toggle left panel"
        className={[
          "absolute top-1",
          // Hang the button slightly outside the seam.
          isLeft ? "-right-7" : "-left-7",
          "pointer-events-auto cursor-pointer",
        ].join(" ")}
      >
        <div className="rounded-md border bg-transparent border-none shadow px-1.5 py-1 hover:bg-muted transition">
          <PanelLeft className="h-3.5 w-3.5" />
        </div>
      </button>
    </div>
  );
}

function RailLabel({ collapsedLabel }: { collapsedLabel?: React.ReactNode }) {
  const railHintText = "PROJECT TEMPLATES";
  return (
    <div
      className="absolute top-32 left-1/2 -translate-x-1/2 text-[10px] select-none"
      style={{ writingMode: "vertical-rl", transform: "rotate(270deg)" }}
      aria-hidden
    >
      {collapsedLabel ?? (
        <>
          {railHintText.split("").map((ch, i) => (
            <p key={`${ch}-${i}`} className="font-bold">
              {ch == " " ? <br /> : ch}
            </p>
          ))}
        </>
      )}
    </div>
  );
}
