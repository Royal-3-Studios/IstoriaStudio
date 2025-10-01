import { useEffect, useRef, useState, useMemo } from "react";
import { Group, Image as KonvaImage } from "react-konva";
import type Konva from "konva";
import {
  useKonvaImage,
  useKonvaImageBinder,
} from "@/lib/konva/hooks/useKonvaImage";
import {
  loadImageFromURL,
  type LoadedImage,
} from "@/lib/konva/utils/imageLoader";

type Props = {
  width: number;
  height: number;
  dpr: number;
  showGrid?: boolean;
  gridSize?: number;
  showBleed?: boolean;
  referenceUrl?: string; // optional: draw a reference photo under guides
};

export default function ReferenceLayer({
  width,
  height,
  dpr,
  showGrid = true,
  gridSize = 16,
  showBleed = true,
  referenceUrl,
}: Props) {
  // draw grid/guides into a raster for KonvaImage
  const deps = useMemo<ReadonlyArray<unknown>>(
    () => [showGrid, gridSize, showBleed, width, height, dpr],
    [showGrid, gridSize, showBleed, width, height, dpr]
  );

  const { image: gridImage } = useKonvaImage({
    width,
    height,
    dpr,
    draw: (_canvas, ctx) => {
      const c2d = ctx as CanvasRenderingContext2D;
      if (showGrid) {
        c2d.lineWidth = 1 / dpr;
        c2d.strokeStyle = "rgba(0,0,0,0.15)";
        for (let x = 0; x <= width; x += gridSize) {
          c2d.beginPath();
          c2d.moveTo(x, 0);
          c2d.lineTo(x, height);
          c2d.stroke();
        }
        for (let y = 0; y <= height; y += gridSize) {
          c2d.beginPath();
          c2d.moveTo(0, y);
          c2d.lineTo(width, y);
          c2d.stroke();
        }
      }
      if (showBleed) {
        const pad = 24;
        c2d.strokeStyle = "rgba(255,0,0,0.5)";
        c2d.lineWidth = 2 / dpr;
        c2d.strokeRect(pad, pad, width - pad * 2, height - pad * 2);
      }
    },
    deps,
  });

  // Properly type the binder as a ref callback for Konva.Image
  const bindGrid = useKonvaImageBinder(gridImage) as (
    node: Konva.Image | null
  ) => void;

  // Optional background photo
  const [loaded, setLoaded] = useState<LoadedImage | null>(null);
  const bgRef = useRef<Konva.Image>(null);

  useEffect(() => {
    let disposed = false;

    (async () => {
      loaded?.dispose();
      setLoaded(null);
      if (!referenceUrl) return;

      try {
        const res = await loadImageFromURL(referenceUrl, {
          crossOrigin: "anonymous",
          decode: true,
        });
        if (disposed) res.dispose();
        else setLoaded(res);
      } catch {
        // optional image, ignore load errors
      }
    })();

    return () => {
      disposed = true;
      loaded?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceUrl]);

  return (
    <Group listening={false}>
      {loaded?.img && (
        <KonvaImage
          ref={bgRef}
          image={loaded.img}
          x={0}
          y={0}
          width={width}
          height={height}
          listening={false}
        />
      )}

      <KonvaImage
        ref={bindGrid}
        image={gridImage ?? undefined}
        listening={false}
        perfectDrawEnabled={false}
      />
    </Group>
  );
}
