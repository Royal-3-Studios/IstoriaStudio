// src/components/editor/LeftSidebar.tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type Asset = {
  id: string;
  label: string;
  width: number;
  height: number;
  // (optional) future: thumbUrl?: string;
};

export default function LeftSidebar({
  assets,
  activeAssetId,
  onSelectAction,
}: {
  assets: Asset[];
  activeAssetId: string | null | undefined;
  onSelectAction?: (id: string) => void;
}) {
  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="px-3 py-1 border-b">
        <div className="text-xs font-medium text-center">Project Templates</div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
        {assets.length === 0 ? (
          <EmptyState />
        ) : (
          assets.map((a) => (
            <AssetThumb
              key={a.id}
              asset={a}
              active={a.id === activeAssetId}
              onClick={() => onSelectAction?.(a.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-8 mx-2 rounded-md border bg-background/60 px-3 py-4 text-xs text-muted-foreground">
      No items yet. Select sizes in the gallery and they’ll appear here.
    </div>
  );
}

/**
 * Scales a w×h rectangle to fit within maxW×maxH (contain).
 */
function fitRect(
  w: number,
  h: number,
  maxW: number,
  maxH: number
): { width: number; height: number } {
  const s = Math.min(maxW / Math.max(1, w), maxH / Math.max(1, h));
  return {
    width: Math.max(1, Math.round(w * s)),
    height: Math.max(1, Math.round(h * s)),
  };
}

function formatDims(w: number, h: number) {
  return `${w}×${h}px`;
}

function AssetThumb({
  asset,
  active,
  onClick,
}: {
  asset: Asset;
  active: boolean;
  onClick: () => void;
}) {
  // Sidebar’s open width is ~200px in your overlay.
  // Give each card some padding; use a preview bay ~160×120 to keep rows tidy.
  const PREVIEW_W = 160;
  const PREVIEW_H = 120;

  const preview = React.useMemo(
    () => fitRect(asset.width, asset.height, PREVIEW_W, PREVIEW_H),
    [asset.width, asset.height]
  );

  return (
    <div
      className={cn(
        "group rounded-md border bg-card/70 hover:bg-card transition-colors cursor-pointer",
        active ? "ring-2 ring-primary border-primary/40" : "border-border"
      )}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      title={`Switch to ${asset.label}`}
    >
      {/* Top: preview bay */}
      <div className="px-2 pt-2">
        <div
          className={cn(
            "relative mx-auto rounded-sm bg-neutral-900/90 border shadow-sm",
            "flex items-center justify-center overflow-hidden"
          )}
          style={{ width: PREVIEW_W, height: PREVIEW_H, lineHeight: 0 }}
        >
          {/* If you have future thumbnails, render an <img> here.
              For now, draw a proportional rectangle to show aspect. */}
          <div
            className="relative bg-background"
            style={{
              width: preview.width,
              height: preview.height,
              boxShadow: "0 0 0 1px rgba(255,255,255,0.2) inset",
            }}
          >
            {/* faint grid lines to suggest canvas */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `
                  linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px),
                  linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)
                `,
                backgroundSize: "10px 10px",
                opacity: 0.8,
                pointerEvents: "none",
              }}
            />
          </div>
        </div>
      </div>

      {/* Bottom: meta */}
      <div className="px-2 pt-2 pb-2">
        <div className="text-[11px] font-medium truncate">{asset.label}</div>
        <div className="text-[10px] text-muted-foreground">
          {formatDims(asset.width, asset.height)}
        </div>

        {/* Active chip */}
        <div className="mt-1 h-5">
          {active ? (
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-[2px] text-[10px]">
              Active
            </span>
          ) : (
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-muted-foreground">
              Click to switch
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
