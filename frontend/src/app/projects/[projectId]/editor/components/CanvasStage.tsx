// src/app/projects/[projectId]/components/CanvasStage.tsx

"use client";
import dynamic from "next/dynamic";
import type Konva from "konva";

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

type Props = {
  stageRef: React.RefObject<Konva.Stage>;
  stageWidthPx: number;
  stageHeightPx: number;
  composedStageScale: number;
  frameW: number;
  frameH: number;
  bg: "white" | "black";
  imageElement: HTMLImageElement | null;
  imageOffsetX: number;
  imageOffsetY: number;
  imageScale: number;
  draggable: boolean;
  onImageDragEnd: (x: number, y: number) => void;
  showTexts: boolean;
  titleText: string;
  subtitleText: string;
  authorText: string;
  primaryTextColor: string;
};

export default function CanvasStage(props: Props) {
  const {
    stageRef,
    stageWidthPx,
    stageHeightPx,
    composedStageScale,
    frameW,
    frameH,
    bg,
    imageElement,
    imageOffsetX,
    imageOffsetY,
    imageScale,
    draggable,
    onImageDragEnd,
    showTexts,
    titleText,
    subtitleText,
    authorText,
    primaryTextColor,
  } = props;

  return (
    <div
      className="inline-block border rounded-sm shadow-sm bg-neutral-900"
      style={{ lineHeight: 0 }}
    >
      <Stage width={stageWidthPx} height={stageHeightPx} ref={stageRef}>
        <Layer scaleX={composedStageScale} scaleY={composedStageScale}>
          <Rect
            x={0}
            y={0}
            width={frameW || 1}
            height={frameH || 1}
            fill={bg === "white" ? "#fff" : "#000"}
          />
          {imageElement && (
            <KonvaImage
              image={imageElement}
              x={imageOffsetX}
              y={imageOffsetY}
              scaleX={imageScale}
              scaleY={imageScale}
              draggable={draggable}
              onDragEnd={(e) => onImageDragEnd(e.target.x(), e.target.y())}
            />
          )}
          {showTexts && imageElement && (
            <>
              <KonvaText
                text={titleText}
                fill={primaryTextColor}
                fontSize={Math.round((frameH || 1) * 0.12)}
                fontStyle="bold"
                x={Math.round((frameW || 1) * 0.06)}
                y={Math.round((frameH || 1) * 0.08)}
                width={Math.round((frameW || 1) * 0.88)}
                align="center"
                listening={false}
              />
              {!!subtitleText && (
                <KonvaText
                  text={subtitleText}
                  fill={primaryTextColor}
                  fontSize={Math.round((frameH || 1) * 0.06)}
                  x={Math.round((frameW || 1) * 0.08)}
                  y={Math.round((frameH || 1) * 0.28)}
                  width={Math.round((frameW || 1) * 0.84)}
                  align="center"
                  listening={false}
                />
              )}
              <KonvaText
                text={authorText}
                fill={primaryTextColor}
                fontSize={Math.round((frameH || 1) * 0.05)}
                x={Math.round((frameW || 1) * 0.1)}
                y={Math.round((frameH || 1) * 0.85)}
                width={Math.round((frameW || 1) * 0.8)}
                align="center"
                listening={false}
              />
            </>
          )}
        </Layer>
      </Stage>
    </div>
  );
}
