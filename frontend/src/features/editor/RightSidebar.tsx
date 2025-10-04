"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Eye,
  EyeOff,
  Image as ImageIcon,
  Type as TypeIcon,
  Square as BoxIcon,
  Plus,
  Minus,
} from "lucide-react";

// ---- Types ----
export type LayerItem = {
  id: string;
  kind: "text" | "box" | "image";
  name: string;
};

export type AssetItem = {
  id: string;
  name: string;
  thumbUrl?: string;
  width?: number;
  height?: number;
};

export type TextLayoutItem = {
  id: string;
  name: string;
  description?: string;
};

type RightSidebarProps = {
  /** Required: the visible layer stack */
  layers: LayerItem[];
  /** Required: ids that are hidden (use a Set so lookups are O(1)) */
  hidden: ReadonlySet<string>;
  /** Required: currently selected layer id (or null) */
  selectedId: string | null;

  /** Required: select a layer */
  onSelectAction: (id: string) => void;
  /** Required: toggle a layer's visibility */
  onToggleVisibleAction: (id: string) => void;

  /** Optional: project-scoped assets to insert */
  projectAssets?: AssetItem[];
  /** Optional: account/global assets to insert */
  globalAssets?: AssetItem[];
  /** Optional: handler to insert an asset into the canvas */
  onInsertAssetAction?: (asset: AssetItem) => void;

  /** Optional: predefined text layouts to apply */
  textLayouts?: TextLayoutItem[];
  /** Optional: apply a text layout by id */
  onApplyTextLayoutAction?: (layoutId: string) => void;

  className?: string;
};

// Small helper for layer icon
function LayerKindIcon({ kind }: { kind: LayerItem["kind"] }) {
  if (kind === "text") return <TypeIcon className="h-4 w-4" />;
  if (kind === "box") return <BoxIcon className="h-4 w-4" />;
  return <ImageIcon className="h-4 w-4" />;
}

export default function RightSidebar({
  layers,
  hidden,
  selectedId,
  onSelectAction,
  onToggleVisibleAction,
  projectAssets = [],
  globalAssets = [],
  onInsertAssetAction,
  textLayouts = [],
  onApplyTextLayoutAction,
  className,
}: RightSidebarProps) {
  return (
    <aside
      className={cn(
        "h-full w-full flex flex-col overflow-hidden bg-background",
        className
      )}
      aria-label="Right editor sidebar"
    >
      {/* Scrollable content */}
      <div className="flex-1 overflow-auto px-2 py-2 bg-accent">
        <Accordion
          type="multiple"
          defaultValue={["layers"]}
          className="space-y-2"
        >
          {/* LAYERS -------------------------------------------------------- */}
          <AccordionItem
            value="layers"
            className="rounded-md bg-secondary border-none"
          >
            <AccordionTrigger
              usePlusMinus={true}
              className="px-3 py-2 text-sm group data-[state=open]:rounded-b-none cursor-pointer"
            >
              <div className="flex w-full items-center justify-between">
                <span className="font-medium">Layers</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-2 pb-2">
              <ul className="space-y-1">
                {layers.length === 0 && (
                  <li className="text-xs text-muted-foreground px-2 py-4 text-center">
                    No layers yet.
                  </li>
                )}
                {layers.map((ly) => {
                  const isHidden = hidden.has(ly.id);
                  const isActive = ly.id === selectedId;
                  return (
                    <li
                      key={ly.id}
                      className={cn(
                        "flex items-center gap-2 rounded-md border px-2 py-1.5",
                        isActive ? "bg-primary/10 border-primary/30" : "bg-card"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectAction(ly.id)}
                        className={cn(
                          "flex-1 flex items-center gap-2 text-left",
                          "hover:opacity-90"
                        )}
                        title={`Select ${ly.name}`}
                        aria-current={isActive ? "true" : undefined}
                      >
                        <LayerKindIcon kind={ly.kind} />
                        <span
                          className={cn(
                            "truncate text-xs",
                            isHidden && "opacity-50 line-through"
                          )}
                        >
                          {ly.name}
                        </span>
                      </button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => onToggleVisibleAction(ly.id)}
                        title={isHidden ? "Show layer" : "Hide layer"}
                        aria-label={isHidden ? "Show layer" : "Hide layer"}
                      >
                        {isHidden ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </AccordionContent>
          </AccordionItem>

          {/* PROJECT ASSETS ------------------------------------------------ */}
          <AccordionItem
            value="project-assets"
            className="rounded-md bg-secondary border-none"
          >
            <AccordionTrigger
              usePlusMinus={true}
              className="px-3 py-2 text-sm group data-[state=open]:rounded-b-none cursor-pointer"
            >
              <div className="flex w-full items-center justify-between">
                <span className="font-medium">Project Assets</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-2 pb-2">
              {projectAssets.length === 0 ? (
                <div className="text-xs text-muted-foreground px-2 py-4 text-center">
                  No project assets yet.
                </div>
              ) : (
                <AssetGrid
                  items={projectAssets}
                  onInsert={onInsertAssetAction}
                />
              )}
            </AccordionContent>
          </AccordionItem>

          {/* GLOBAL ASSETS ------------------------------------------------- */}
          <AccordionItem
            value="global-assets"
            className="rounded-md bg-secondary border-none"
          >
            <AccordionTrigger
              usePlusMinus={true}
              className="px-3 py-2 text-sm group data-[state=open]:rounded-b-none cursor-pointer"
            >
              <div className="flex w-full items-center justify-between">
                <span className="font-medium">Global Assets</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-2 pb-2">
              {globalAssets.length === 0 ? (
                <div className="text-xs text-muted-foreground px-2 py-4 text-center">
                  No global assets yet.
                </div>
              ) : (
                <AssetGrid
                  items={globalAssets}
                  onInsert={onInsertAssetAction}
                />
              )}
            </AccordionContent>
          </AccordionItem>

          {/* PRESET TEXT LAYOUTS ------------------------------------------- */}
          <AccordionItem
            value="text-layouts"
            className="rounded-md bg-secondary border-none"
          >
            <AccordionTrigger
              usePlusMinus={true}
              className="px-3 py-2 text-sm group data-[state=open]:rounded-b-none cursor-pointer"
            >
              <div className="flex w-full items-center justify-between">
                <span className="font-medium">Preset Text Layouts</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-2 pb-2">
              {textLayouts.length === 0 ? (
                <div className="text-xs text-muted-foreground px-2 py-4 text-center">
                  No layouts yet.
                </div>
              ) : (
                <ul className="space-y-1">
                  {textLayouts.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">
                          {t.name}
                        </div>
                        {!!t.description && (
                          <div className="text-[10px] text-muted-foreground truncate">
                            {t.description}
                          </div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        onClick={() => onApplyTextLayoutAction?.(t.id)}
                      >
                        Apply
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </aside>
  );
}

/** Small grid renderer for asset thumbs/list */
function AssetGrid({
  items,
  onInsert,
}: {
  items: AssetItem[];
  onInsert?: (asset: AssetItem) => void;
}) {
  if (!onInsert) {
    // read-only grid if you haven't wired insertion yet
    return (
      <div className="grid grid-cols-2 gap-2">
        {items.map((a) => (
          <div
            key={a.id}
            className="rounded-md border overflow-hidden bg-muted"
            title={a.name}
          >
            <Thumb asset={a} />
            <div className="px-2 py-1 text-[10px] truncate bg-card/70">
              {a.name}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onInsert(a)}
          className="text-left rounded-md border overflow-hidden hover:shadow focus-visible:outline-none focus-visible:ring-2"
          title={`Insert ${a.name}`}
        >
          <Thumb asset={a} />
          <div className="px-2 py-1 text-[10px] truncate bg-card/70">
            {a.name}
          </div>
        </button>
      ))}
    </div>
  );
}

function Thumb({ asset }: { asset: AssetItem }) {
  const ratio = asset.width && asset.height ? asset.width / asset.height : 1.5; // default wide-ish
  const padTop = `${100 / ratio}%`;

  return (
    <div className="relative w-full bg-background">
      <div style={{ paddingTop: padTop }} />
      <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
        {asset.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.thumbUrl}
            alt={asset.name}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div className="text-[10px] text-muted-foreground px-2 py-1">
            {asset.width && asset.height
              ? `${asset.width}×${asset.height}`
              : "No preview"}
          </div>
        )}
      </div>
    </div>
  );
}
