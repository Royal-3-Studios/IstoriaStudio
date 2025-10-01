// src/features/editor/types/layers.ts

export type CanvasBg = "white" | "black";

export type TextLayer = {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
};

export type BoxLayer = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

// Keep Step close to the editor unless it’s truly app-wide
export type Step = "type" | "edit" | "variants" | "qa" | "export";
