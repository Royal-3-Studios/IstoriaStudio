// src/components/editor/FullEditorOverlay.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type Konva from "konva";
import Transformer from "@/components/konva/TransformerClient";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  LogOut as ExitIcon,
  Wand2 as MagicIcon,
  Maximize2,
  Minimize2,
  Hand,
  Grid as GridIcon,
  PanelLeft,
  PanelRight,
} from "lucide-react";

import EditBar from "@/components/editor/EditBar";
import LeftPanel from "@/components/editor/LeftPanel";
import RightPanel from "@/components/editor/RightPanel";
import RightSidebar from "@/components/editor/RightSidebar";

import { useCanvasSizing } from "@/app/projects/[projectId]/editor/hooks/useCanvasSizing";
import { useFullscreen } from "@/app/projects/[projectId]/editor/hooks/useFullscreen";
import LeftSidebar from "./LeftSidebar";

// Konva (client-only)
const Stage = dynamic(
  () => import("@/components/konva/StageClient").then((m) => m.default),
  { ssr: false }
);
const Layer = dynamic(
  () => import("@/components/konva/LayerClient").then((m) => m.default),
  { ssr: false }
);
const KonvaImage = dynamic(
  () => import("@/components/konva/ImageClient").then((m) => m.default),
  { ssr: false }
);
const KonvaText = dynamic(
  () => import("@/components/konva/TextClient").then((m) => m.default),
  { ssr: false }
);
const Rect = dynamic(
  () => import("@/components/konva/RectClient").then((m) => m.default),
  { ssr: false }
);

type TextLayer = {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
};
type BoxLayer = { id: string; x: number; y: number; w: number; h: number };

export type FullEditorOverlayProps = {
  open: boolean;
  onClose: () => void;
  onAiVariant?: () => void;

  // canvas props
  preset: { width: number; height: number; label?: string };
  imageElement: HTMLImageElement | null;
  imageScale: number;
  imageOffsetX: number;
  imageOffsetY: number;
  setImageOffsetX: (v: number | ((x: number) => number)) => void;
  setImageOffsetY: (v: number | ((y: number) => number)) => void;

  texts: TextLayer[];
  setTexts: React.Dispatch<React.SetStateAction<TextLayer[]>>;
  boxes: BoxLayer[];
  setBoxes: React.Dispatch<React.SetStateAction<BoxLayer[]>>;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;

  // nullable refs (keep shape to avoid TS mismatch)
  stageRef: React.RefObject<Konva.Stage | null>;
  transformerRef: React.RefObject<Konva.Transformer | null>;

  canvasBg: "white" | "black";

  // OPTIONAL: multi-asset navigator on the left
  assets?: Array<{ id: string; label: string; width: number; height: number }>;
  activeAssetId?: string | null;
  onSelectAssetAction?: (id: string) => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export default function FullEditorOverlay(props: FullEditorOverlayProps) {
  const {
    open,
    onClose,
    onAiVariant,
    preset,
    imageElement,
    imageScale,
    imageOffsetX,
    imageOffsetY,
    setImageOffsetX,
    setImageOffsetY,
    texts,
    setTexts,
    boxes,
    setBoxes,
    selectedId,
    setSelectedId,
    stageRef,
    transformerRef,
    canvasBg,
    assets = [],
    activeAssetId = null,
    onSelectAssetAction,
  } = props;

  // Fullscreen control on overlay root
  const {
    targetRef: overlayRef,
    isFullscreen,
    exit: exitFullscreen,
    toggle: toggleFullscreen,
  } = useFullscreen<HTMLDivElement>();

  // Prevent background scroll only while open
  useEffect(() => {
    if (!open) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [open]);

  // View state
  const [hand, setHand] = useState(false);
  const [showGrid, setShowGrid] = useState(false);

  // Zoom model: EditBar uses 1 = “Fit to container”
  const [zoomPercent, setZoomPercent] = useState(1);
  const ZOOM_MIN = 0.05;
  const ZOOM_MAX = 4;

  // Scrollable canvas bay
  const bayRef = useRef<HTMLDivElement | null>(null);

  // Base fit-to-container scale, then multiply by zoom
  const { containerRef, fitToContainerScale } = useCanvasSizing(
    preset.width || 1,
    preset.height || 1,
    4096
  );
  const totalScale = (fitToContainerScale || 1) * zoomPercent;

  // Stage pixel size
  const stageWidth = Math.max(1, Math.floor((preset.width || 1) * totalScale));
  const stageHeight = Math.max(
    1,
    Math.floor((preset.height || 1) * totalScale)
  );

  // Keep transformer attached to the selected node
  useEffect(() => {
    const tr = transformerRef.current;
    const st = stageRef.current;
    if (!tr || !st) return;

    if (!selectedId) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    const node = st.findOne(`#${selectedId}`);
    if (node) {
      tr.nodes([node]);
      tr.getLayer()?.batchDraw();
    }
  }, [selectedId, stageRef, transformerRef]);

  // Layers for RightSidebar
  const layers = useMemo(
    () => [
      ...(imageElement
        ? [{ id: "bg", kind: "image" as const, name: "Background Image" }]
        : []),
      ...boxes.map((b, i) => ({
        id: b.id,
        kind: "box" as const,
        name: `Box ${i + 1}`,
      })),
      ...texts.map((t, i) => ({
        id: t.id,
        kind: "text" as const,
        name: t.text || `Text ${i + 1}`,
      })),
    ],
    [imageElement, boxes, texts]
  );
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  // Hand-drag pan in the bay
  function onBayMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!hand) return;
    const el = bayRef.current;
    if (!el) return;
    el.classList.add("cursor-grabbing");
    const startX = e.clientX,
      startY = e.clientY;
    const startL = el.scrollLeft,
      startT = el.scrollTop;

    const move = (ev: MouseEvent) => {
      el.scrollLeft = startL - (ev.clientX - startX);
      el.scrollTop = startT - (ev.clientY - startY);
    };
    const up = () => {
      el.classList.remove("cursor-grabbing");
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  // Left / Right panels (desktop) + Mobile “drawers”
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftMobileOpen, setLeftMobileOpen] = useState(false);
  const [rightMobileOpen, setRightMobileOpen] = useState(false);

  // Desktop fixed widths (no resizers)
  const LEFT_OPEN_WIDTH = 200;
  const LEFT_RAIL_WIDTH = 24;
  const RIGHT_OPEN_WIDTH = 320;
  const RIGHT_RAIL_WIDTH = 56;

  // Avoid using window in render for columns; track viewport once mounted
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === "undefined") return true; // SSR-safe default
    return window.innerWidth >= 1024;
  });
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      console.log("[editor] forcing leftMobileOpen true (debug)");
      setLeftMobileOpen(true);
    }
  }, []);

  const gridTemplateColumns = useMemo(() => {
    if (isDesktop) {
      const left = leftOpen ? `${LEFT_OPEN_WIDTH}px` : `${LEFT_RAIL_WIDTH}px`;
      const right = rightOpen
        ? `${RIGHT_OPEN_WIDTH}px`
        : `${RIGHT_RAIL_WIDTH}px`;
      return `${left} minmax(0,1fr) ${right}`;
    }
    return "minmax(0,1fr)";
  }, [isDesktop, leftOpen, rightOpen]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] bg-background"
      style={{ display: open ? "block" : "none" }}
    >
      {/* ==== Row 0: top info/actions ==== */}
      <div className="h-10 border-b bg-background/95 px-3 sm:px-4 flex items-center justify-between">
        <div className="text-xs sm:text-sm text-muted-foreground">
          Editing:{" "}
          <span className="text-foreground font-medium">
            {preset.label ?? "Asset"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* On lg: toggle sidebars in/out. On small: open mobile overlays */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              isDesktop ? setLeftOpen((v) => !v) : setLeftMobileOpen(true)
            }
            title="Toggle left panel"
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              isDesktop ? setRightOpen((v) => !v) : setRightMobileOpen(true)
            }
            title="Toggle right panel"
          >
            <PanelRight className="h-3.5 w-3.5" />
          </Button>

          <Button
            size="sm"
            variant={hand ? "secondary" : "ghost"}
            onClick={() => setHand((v) => !v)}
            title={hand ? "Disable Hand" : "Enable Hand"}
          >
            <Hand className="h-3.5 w-3.5 mr-1.5" /> Hand
          </Button>
          <Button
            size="sm"
            variant={showGrid ? "secondary" : "ghost"}
            onClick={() => setShowGrid((v) => !v)}
            title="Toggle Grid"
          >
            <GridIcon className="h-4 w-4 mr-1.5" /> Grid
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit full screen" : "Full screen"}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="h-4 w-4 mr-1.5" /> Exit Full
              </>
            ) : (
              <>
                <Maximize2 className="h-4 w-4 mr-1.5" /> Full Screen
              </>
            )}
          </Button>
          {onAiVariant && (
            <Button
              size="sm"
              variant="outline"
              onClick={onAiVariant}
              title="Generate Variant (AI)"
            >
              <MagicIcon className="h-4 w-4 mr-1.5" /> AI Variant
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              await exitFullscreen();
              onClose();
            }}
            title="Exit editor"
          >
            <ExitIcon className="h-4 w-4 mr-1.5" /> Exit
          </Button>
        </div>
      </div>

      {/* ==== Row 1: EditBar (zoom/fit) ==== */}
      <EditBar
        zoomPercent={zoomPercent}
        onZoomInAction={() =>
          setZoomPercent((z) => Math.min(ZOOM_MAX, +(z * 1.1).toFixed(3)))
        }
        onZoomOutAction={() =>
          setZoomPercent((z) => Math.max(ZOOM_MIN, +(z / 1.1).toFixed(3)))
        }
        onZoomToAction={(n) =>
          setZoomPercent(() => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, n)))
        }
        onFitAction={() => setZoomPercent(1)}
        className="border-t-0"
      />

      {/* ==== Main area grid ==== */}
      <div
        className="w-full"
        style={{
          height: "calc(100vh - 5rem)", // 2.5rem top + 2.5rem editbar
          display: "grid",
          gridTemplateColumns: gridTemplateColumns,
        }}
      >
        {/* ===== LEFT (desktop only) ===== */}
        <div className="hidden lg:flex border-r bg-muted/20 relative overflow-visible transition-[width] duration-200 ease-in-out">
          <LeftPanel
            open={leftOpen}
            onToggleAction={setLeftOpen}
            assets={assets}
            activeAssetId={activeAssetId}
            onSelectAssetAction={onSelectAssetAction}
            openWidth={LEFT_OPEN_WIDTH}
            railWidth={LEFT_RAIL_WIDTH}
          />
        </div>

        {/* ===== CENTER: Canvas bay ===== */}
        <div className="relative min-w-0 min-h-0">
          <div
            ref={bayRef}
            className={[
              "flex h-full w-full items-center justify-center p-3 sm:p-4 md:p-6",
              "overflow-auto",
              "min-h-0 min-w-0",
              hand ? "cursor-grab" : "",
            ].join(" ")}
            onMouseDown={onBayMouseDown}
          >
            <div className="relative w-full h-full min-w-0 min-h-0">
              {/* Lightweight CSS rulers (top/left) */}
              <div className="absolute left-6 top-0 right-0 h-6 z-20 pointer-events-none">
                <div
                  className="w-full h-full"
                  style={{
                    background:
                      "repeating-linear-gradient(to right, rgba(0,0,0,0.12), rgba(0,0,0,0.12) 1px, transparent 1px, transparent 10px)",
                  }}
                />
              </div>
              <div className="absolute left-0 top-6 bottom-0 w-6 z-20 pointer-events-none">
                <div
                  className="w-full h-full"
                  style={{
                    background:
                      "repeating-linear-gradient(to bottom, rgba(0,0,0,0.12), rgba(0,0,0,0.12) 1px, transparent 1px, transparent 10px)",
                  }}
                />
              </div>

              {/* Stage container inset to leave room for rulers */}
              <div
                ref={containerRef}
                className="absolute inset-[24px_0_0_24px] flex items-center justify-center min-w-0 min-h-0"
              >
                <div
                  className="inline-block border rounded-sm shadow-sm bg-neutral-900 relative"
                  style={{
                    lineHeight: 0,
                    width: stageWidth,
                    height: stageHeight,
                  }}
                >
                  {/* Optional grid overlay (CSS) */}
                  {showGrid && (
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        backgroundImage: `
                          linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px),
                          linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)
                        `,
                        backgroundSize: `${Math.max(
                          8,
                          Math.round(50 * totalScale)
                        )}px ${Math.max(8, Math.round(50 * totalScale))}px`,
                      }}
                    />
                  )}

                  {/* Konva Stage */}
                  <Stage
                    width={stageWidth}
                    height={stageHeight}
                    ref={stageRef}
                    onMouseDown={(e) => {
                      if (e.target === e.target.getStage()) setSelectedId(null);
                    }}
                    onTap={(e) => {
                      if (e.target === e.target.getStage()) setSelectedId(null);
                    }}
                  >
                    <Layer scaleX={totalScale} scaleY={totalScale}>
                      {/* Frame */}
                      <Rect
                        x={0}
                        y={0}
                        width={preset.width || 1}
                        height={preset.height || 1}
                        fill={canvasBg === "white" ? "#fff" : "#000"}
                        listening={false}
                      />

                      {/* Background image (respect hidden) */}
                      {imageElement && !hiddenIds.has("bg") && (
                        <KonvaImage
                          id="bg"
                          image={imageElement}
                          x={imageOffsetX}
                          y={imageOffsetY}
                          scaleX={imageScale}
                          scaleY={imageScale}
                          draggable
                          onClick={() => setSelectedId("bg")}
                          onTap={() => setSelectedId("bg")}
                          onDragEnd={(e) => {
                            setImageOffsetX(e.target.x());
                            setImageOffsetY(e.target.y());
                          }}
                        />
                      )}

                      {/* Boxes */}
                      {boxes.map((b) =>
                        hiddenIds.has(b.id) ? null : (
                          <Rect
                            key={b.id}
                            id={b.id}
                            x={b.x}
                            y={b.y}
                            width={b.w}
                            height={b.h}
                            fill="#00000088"
                            stroke="#ffffff"
                            strokeWidth={2}
                            draggable
                            onClick={() => setSelectedId(b.id)}
                            onTap={() => setSelectedId(b.id)}
                            onDragEnd={(e) => {
                              const { x, y } = e.target.position();
                              setBoxes((arr) =>
                                arr.map((it) =>
                                  it.id === b.id ? { ...it, x, y } : it
                                )
                              );
                            }}
                            onTransformEnd={(
                              e: Konva.KonvaEventObject<Event>
                            ) => {
                              const node = e.target;
                              const scaleX = node.scaleX();
                              const scaleY = node.scaleY();
                              node.scaleX(1);
                              node.scaleY(1);
                              setBoxes((arr) =>
                                arr.map((it) =>
                                  it.id === b.id
                                    ? {
                                        ...it,
                                        x: node.x(),
                                        y: node.y(),
                                        w: Math.max(2, b.w * scaleX),
                                        h: Math.max(2, b.h * scaleY),
                                      }
                                    : it
                                )
                              );
                            }}
                          />
                        )
                      )}

                      {/* Texts */}
                      {texts.map((t) =>
                        hiddenIds.has(t.id) ? null : (
                          <KonvaText
                            key={t.id}
                            id={t.id}
                            text={t.text}
                            fill="#ffffff"
                            fontSize={t.size}
                            x={t.x}
                            y={t.y}
                            draggable
                            onClick={() => setSelectedId(t.id)}
                            onTap={() => setSelectedId(t.id)}
                            onDragEnd={(e) => {
                              const { x, y } = e.target.position();
                              setTexts((arr) =>
                                arr.map((it) =>
                                  it.id === t.id ? { ...it, x, y } : it
                                )
                              );
                            }}
                            onTransformEnd={(
                              e: Konva.KonvaEventObject<Event>
                            ) => {
                              const node = e.target;
                              const scaleY = node.scaleY();
                              node.scaleY(1);
                              const nextSize = Math.max(
                                4,
                                Math.round(t.size * scaleY)
                              );
                              setTexts((arr) =>
                                arr.map((it) =>
                                  it.id === t.id
                                    ? { ...it, size: nextSize }
                                    : it
                                )
                              );
                            }}
                          />
                        )
                      )}

                      {/* Transformer */}
                      <Transformer
                        ref={transformerRef}
                        rotateEnabled
                        keepRatio
                      />
                    </Layer>
                  </Stage>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===== RIGHT (desktop only) ===== */}
        <div className="hidden lg:flex border-l bg-muted/10 relative overflow-visible transition-[width] duration-200 ease-in-out">
          <RightPanel
            open={rightOpen}
            onToggleAction={setRightOpen}
            width={RIGHT_OPEN_WIDTH}
            railWidth={RIGHT_RAIL_WIDTH}
          >
            <RightSidebar
              layers={layers}
              hidden={hiddenIds}
              selectedId={selectedId}
              onSelectAction={setSelectedId}
              onToggleVisibleAction={(id) =>
                setHiddenIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
            />
          </RightPanel>
        </div>
      </div>

      {/* === MOBILE: Left sheet (under lg) === */}
      <div className="lg:hidden">
        {/* Custom overlay to dim/close (high z to beat page overlay) */}
        {leftMobileOpen && (
          <div
            className="fixed inset-0 bg-background/70 backdrop-blur-[1px] z-[990]"
            onClick={() => setLeftMobileOpen(false)}
          />
        )}
        <button
          type="button"
          title="Open left panel"
          aria-label="Open left panel"
          onClick={() => {
            setRightMobileOpen(false);
            setLeftMobileOpen(true);
          }}
          className="lg:hidden absolute left-1 top-28 -translate-y-1/2 z-[1200] rounded-md border bg-background shadow px-1.5 py-1 hover:bg-muted"
        >
          <PanelLeft className="h-4 w-4" />
        </button>

        <button
          type="button"
          title="Open right panel"
          aria-label="Open right panel"
          onClick={() => {
            setLeftMobileOpen(false);
            setRightMobileOpen(true);
          }}
          className="lg:hidden fixed right-1 top-28 -translate-y-1/2 z-[1200] rounded-md border bg-background shadow px-1.5 py-1 hover:bg-muted"
        >
          <PanelRight className="h-4 w-4" />
        </button>
        <Sheet open={leftMobileOpen} onOpenChange={setLeftMobileOpen}>
          <SheetContent side="left" className="z-[1000] p-0 w-[85vw] max-w-sm">
            <SheetHeader className="sr-only">
              <SheetTitle>Left panel</SheetTitle>
            </SheetHeader>
            <LeftSidebar
              assets={assets}
              activeAssetId={activeAssetId ?? undefined}
              onSelectAction={(id) => {
                onSelectAssetAction?.(id);
                setLeftMobileOpen(false);
              }}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* === MOBILE: Right sheet (under lg) === */}
      <div className="lg:hidden">
        {rightMobileOpen && (
          <div className="fixed top-2 right-2 z-[5000] rounded bg-blue-600 text-white text-xs px-2 py-1">
            MOBILE RIGHT OPEN (debug)
          </div>
        )}
        {rightMobileOpen && (
          <div
            className="fixed inset-0 bg-background/70 backdrop-blur-[1px] z-[990]"
            onClick={() => setRightMobileOpen(false)}
          />
        )}
        <Sheet open={rightMobileOpen} onOpenChange={setRightMobileOpen}>
          <SheetContent
            side="right"
            className="z-[1000] p-0 w-[90vw] max-w-md border-blue-500"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Right panel</SheetTitle>
            </SheetHeader>
            <RightSidebar
              layers={layers}
              hidden={hiddenIds}
              selectedId={selectedId ?? null}
              onSelectAction={(id) => {
                setSelectedId(id);
                setRightMobileOpen(false);
              }}
              onToggleVisibleAction={(id) => {
                setHiddenIds((prev) => {
                  const s = new Set(prev);
                  s.has(id) ? s.delete(id) : s.add(id);
                  return s;
                });
              }}
            />
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
