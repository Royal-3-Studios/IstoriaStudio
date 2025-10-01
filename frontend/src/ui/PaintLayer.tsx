import { Image as KonvaImage } from "react-konva";
import {
  useKonvaImage,
  useKonvaImageBinder,
} from "@/lib/konva/hooks/useKonvaImage";

export type DrawPaint = (
  canvas: OffscreenCanvas | HTMLCanvasElement,
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
) => void | Promise<void>;

type Props = {
  width: number;
  height: number;
  dpr: number;
  drawPaint: DrawPaint; // same signature as StageView.DrawPaint
  deps?: ReadonlyArray<unknown>; // triggers redraw
};

export default function PaintLayer({
  width,
  height,
  dpr,
  drawPaint,
  deps = [],
}: Props) {
  const { image, busy } = useKonvaImage({
    width,
    height,
    dpr,
    draw: drawPaint,
    deps,
  });

  const bind = useKonvaImageBinder(image);

  return (
    <KonvaImage
      ref={bind}
      image={image ?? undefined}
      listening={false}
      perfectDrawEnabled={false}
      visible={!busy}
    />
  );
}
