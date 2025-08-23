// src/components/editor/FullEditorOverlay.tsx
"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import type Konva from "konva";
import Transformer from "@/components/konva/TransformerClient";
import { Button } from "@/components/ui/button";
import { useFullscreen } from "@/app/projects/[projectId]/editor/hooks/useFullscreen";
import {
  LogOut as ExitIcon,
  Wand2 as MagicIcon,
  PanelsTopLeft,
  Layers,
  Ruler,
  Crop,
  Maximize2,
  Minimize2,
  Type as TypeIcon,
  Square as SquareIcon,
  Image as ImageIcon,
} from "lucide-react";
import { useCanvasSizing } from "@/app/projects/[projectId]/editor/hooks/useCanvasSizing";

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

  // canvas props (reuse page state/refs)
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

  // Use RefObject to avoid deprecation warnings
  stageRef: React.RefObject<Konva.Stage | null>;
  transformerRef: React.RefObject<Konva.Transformer | null>;

  canvasBg: "white" | "black";
};

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
  } = props;
  const {
    targetRef: overlayRef,
    isFullscreen,
    enter,
    exit,
    toggle,
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

  // Always call hooks: compute canvas sizing even when hidden
  const { containerRef, fitToContainerScale } = useCanvasSizing(
    preset.width || 1,
    preset.height || 1,
    4096
  );
  const stageScale = fitToContainerScale || 1;
  const stageWidth = Math.max(1, Math.floor((preset.width || 1) * stageScale));
  const stageHeight = Math.max(
    1,
    Math.floor((preset.height || 1) * stageScale)
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

  return (
    // Hide with CSS instead of returning early so hooks order is stable
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] bg-background"
      style={{ display: open ? "block" : "none" }}
    >
      {/* Top edit bar */}
      <div className="h-12 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-3 sm:px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PanelsTopLeft className="h-4 w-4 opacity-60" />
          <div className="text-xs sm:text-sm text-muted-foreground">
            Editing:{" "}
            <span className="text-foreground font-medium">
              {preset.label ?? "Asset"}
            </span>
          </div>

          {/* Example tool group (placeholders) */}
          <div className="hidden md:flex items-center gap-1 ml-3">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs cursor-pointer"
            >
              <ImageIcon className="h-4 w-4 mr-1" /> Image
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs cursor-pointer"
            >
              <TypeIcon className="h-4 w-4 mr-1" /> Text
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs cursor-pointer"
            >
              <SquareIcon className="h-4 w-4 mr-1" /> Shapes
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs cursor-pointer"
            >
              <Crop className="h-4 w-4 mr-1" /> Crop
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs cursor-pointer"
            >
              <Ruler className="h-4 w-4 mr-1" /> Align
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs cursor-pointer"
            >
              <Layers className="h-4 w-4 mr-1" /> Layers
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onAiVariant && (
            <Button
              size="sm"
              variant="outline"
              onClick={onAiVariant}
              className="rounded-full text-xs cursor-pointer"
            >
              <MagicIcon className="h-3 w-3 mr-1" />
              AI: Generate Variant
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={toggle}
            title={isFullscreen ? "Exit full screen" : "Full screen"}
            className="rounded-full text-xs cursor-pointer"
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="h-3 w-3 mr-1" />
                Exit Full Screen
              </>
            ) : (
              <>
                <Maximize2 className="h-3 w-3 mr-1" />
                Full Screen
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              // If in full screen, exit it first
              await exit();
              // Then close the overlay (back to steps)
              onClose();
            }}
            title="Exit editor"
            className="rounded-full text-xs cursor-pointer"
          >
            <ExitIcon className="h-3 w-3 mr-1" />
            Exit
          </Button>
        </div>
      </div>

      {/* Workspace: left sidebar | canvas bay | right sidebar */}
      <div className="h-[calc(100vh-3rem)] w-full grid grid-cols-[14rem_1fr_18rem]">
        {/* Left sidebar (placeholder) */}
        <div className="hidden md:flex flex-col border-r bg-muted/20 p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
            Tools
          </div>
          {/* TODO: hook these up to your handlers */}
          <Button size="sm" variant="outline" className="mb-2">
            Upload
          </Button>
          <Button size="sm" variant="outline" className="mb-2">
            Add Title
          </Button>
          <Button size="sm" variant="outline">
            Add Box
          </Button>
        </div>

        {/* Center: canvas bay stays centered and constrained */}
        <div className="relative overflow-auto">
          <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
            {/* Canvas bay constraints (tweak these two min()s to taste) */}
            <div className="relative w-[min(90vw,1200px)] h-[min(78vh,820px)]">
              <div
                ref={containerRef}
                className="absolute inset-0 flex items-center justify-center"
              >
                <div
                  className="inline-block border rounded-sm shadow-sm bg-neutral-900"
                  style={{ lineHeight: 0 }}
                >
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
                    <Layer scaleX={stageScale} scaleY={stageScale}>
                      {/* Frame */}
                      <Rect
                        x={0}
                        y={0}
                        width={preset.width || 1}
                        height={preset.height || 1}
                        fill={canvasBg === "white" ? "#fff" : "#000"}
                        listening={false}
                      />

                      {/* Background image */}
                      {imageElement && (
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
                      {boxes.map((b) => (
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
                          onTransformEnd={(e) => {
                            const node = e.target;
                            const scaleX = node.scaleX();
                            const scaleY = node.scaleY();
                            node.scaleX(1);
                            node.scaleY(1);
                            const next = {
                              x: node.x(),
                              y: node.y(),
                              w: Math.max(2, b.w * scaleX),
                              h: Math.max(2, b.h * scaleY),
                            };
                            setBoxes((arr) =>
                              arr.map((it) =>
                                it.id === b.id ? { ...it, ...next } : it
                              )
                            );
                          }}
                        />
                      ))}

                      {/* Texts */}
                      {texts.map((t) => (
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
                          onTransformEnd={(e) => {
                            const node = e.target as Konva.Rect;
                            const scaleY = node.scaleY();
                            node.scaleY(1);
                            const nextSize = Math.max(
                              4,
                              Math.round(t.size * scaleY)
                            );
                            setTexts((arr) =>
                              arr.map((it) =>
                                it.id === t.id ? { ...it, size: nextSize } : it
                              )
                            );
                          }}
                        />
                      ))}

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

        {/* Right sidebar (placeholder) */}
        <div className="hidden lg:flex flex-col border-l bg-muted/10 p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
            Inspector
          </div>
          {/* TODO: properties panel */}
        </div>
      </div>
    </div>
  );
}
