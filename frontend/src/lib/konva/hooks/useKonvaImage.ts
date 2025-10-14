"use client";

// Re-export the hook under the konva-oriented name, plus its options type and binder.
export {
  useBitmapCanvas as useKonvaImage,
  type UseBitmapCanvasOptions as UseKonvaImageOptions,
  useKonvaImageBinder,
} from "./useBitmapCanvas";
