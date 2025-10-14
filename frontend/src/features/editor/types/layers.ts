// Brand to avoid mixing plain strings with layer ids accidentally

export type LayerId = string & { readonly __brand: "LayerId" };

// Safe caster when you already have a string you trust as an ID.
export const asLayerId = (s: string): LayerId => s as LayerId;

// Generator for fresh IDs (uses crypto; you can swap later if needed).
export function newLayerId(): LayerId {
  return (
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  ) as LayerId;
}

/* Example layer shapes */
export type TextLayer = {
  id: LayerId;
  text: string;
  x: number;
  y: number;
  size: number;
};

export type BoxLayer = {
  id: LayerId;
  x: number;
  y: number;
  w: number;
  h: number;
};

/* If you have CanvasBg etc., keep/export those here too */
export type CanvasBg = "white" | "black";

// If you ever need to union layer types:
export type AnyLayer = TextLayer | BoxLayer;

// Editor steps (kept local to editor feature)
export type Step = "type" | "edit" | "variants" | "qa" | "export";
