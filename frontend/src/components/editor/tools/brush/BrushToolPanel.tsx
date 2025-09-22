// src/components/editor/tools/BrushToolPanel.tsx
"use client";

import * as React from "react";
import { useBrushManager } from "@/hooks/useBrushManager";
import {
  BRUSH_BY_ID,
  BRUSH_CATEGORIES,
  type BrushPreset,
} from "@/data/brushPresets";
import { BrushGallery } from "./BrushGallery";
import { BrushSettings } from "./BrushSettings";

/** External change callback carries the active brush id + current UI params. */
export type BrushToolPanelProps = {
  onBrushEngineChangeAction?: (
    brushId: string,
    params: Record<string, number | string>
  ) => void;
  /** If invalid or missing, falls back to the first brush in the generated catalog. */
  initialBrushId?: string;
};

type ParamsMap = Readonly<Record<string, number | string>>;

function shallowEqualParams(a: ParamsMap, b: ParamsMap) {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}

/* ---------- simple localStorage helpers (stringify a Set<string>) ---------- */
const FAV_KEY = "brush:favorites:v1";
function loadFavorites(): ReadonlySet<string> {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}
function saveFavorites(ids: ReadonlySet<string>): void {
  try {
    const arr = Array.from(ids);
    localStorage.setItem(FAV_KEY, JSON.stringify(arr));
  } catch {
    // noop
  }
}

export default function BrushToolPanel({
  onBrushEngineChangeAction,
  initialBrushId,
}: BrushToolPanelProps) {
  /* ---------- Resolve a robust initial brush id from the generated catalog ---------- */
  const catalogFirstId: string =
    BRUSH_CATEGORIES[0]?.brushes?.[0]?.id ??
    Object.keys(BRUSH_BY_ID ?? {})[0] ??
    "";

  const safeInitialId =
    initialBrushId && BRUSH_BY_ID[initialBrushId]
      ? initialBrushId
      : catalogFirstId;

  /* ---------- Brush manager state ---------- */
  const { state, preset, setBrushById, setParam, resetParams } =
    useBrushManager(safeInitialId);

  /* ---------- Compute a concrete preset (never undefined if catalog non-empty) ---------- */
  const fallbackPreset: BrushPreset | undefined =
    BRUSH_CATEGORIES[0]?.brushes?.[0] ??
    (BRUSH_BY_ID ? Object.values(BRUSH_BY_ID)[0] : undefined);

  const currentPreset: BrushPreset | undefined =
    preset ??
    (state.brushId ? BRUSH_BY_ID[state.brushId] : undefined) ??
    fallbackPreset;

  const catalogEmpty = !currentPreset;

  /* ---------- Favorites (persisted) ---------- */
  const [favorites, setFavorites] = React.useState<ReadonlySet<string>>(() =>
    typeof window !== "undefined" ? loadFavorites() : new Set()
  );
  const [showFavs, setShowFavs] = React.useState(false);

  // Persist favorites whenever they change
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    saveFavorites(favorites);
  }, [favorites]);

  // Example: ensure current brush is always in favorites if showFavs toggled and set is empty
  React.useEffect(() => {
    if (!showFavs || !currentPreset) return;
    if (!favorites.size) {
      const next = new Set(favorites);
      next.add(currentPreset.id);
      setFavorites(next);
    }
  }, [showFavs, currentPreset, favorites]);

  /* ---------- ADAPTER: BrushSettings (patch) → useBrushManager.setParam(key,val) ---------- */
  const handleChange = React.useCallback(
    (patch: Record<string, number | string>) => {
      for (const [key, val] of Object.entries(patch)) {
        // BrushSettings sends numeric-ish values; coerce defensively.
        const n = typeof val === "number" ? val : Number(val);
        setParam(key, n);
      }
    },
    [setParam]
  );

  /* ---------- Stable external callback without render loops ---------- */
  const cbRef = React.useRef(onBrushEngineChangeAction);
  React.useEffect(() => {
    cbRef.current = onBrushEngineChangeAction;
  }, [onBrushEngineChangeAction]);

  const lastRef = React.useRef<{ id: string; params: ParamsMap } | null>(null);
  React.useEffect(() => {
    if (!state?.brushId || !state?.params) return;
    const next = { id: state.brushId, params: state.params };
    const prev = lastRef.current;
    if (
      !prev ||
      prev.id !== next.id ||
      !shallowEqualParams(prev.params, next.params)
    ) {
      lastRef.current = next;
      cbRef.current?.(next.id, next.params);
    }
  }, [state.brushId, state.params]);

  /* ---------- Empty-catalog guard ---------- */
  if (catalogEmpty) {
    return (
      <div className="w-full text-sm text-muted-foreground">
        No brushes found. Ensure <code>src/data/brushPresets.generated.ts</code>{" "}
        exports <code>BRUSH_CATEGORIES</code> and <code>BRUSH_BY_ID</code>.
      </div>
    );
  }

  /* ---------- UI ---------- */
  return (
    <div className="w-full">
      <div className="grid gap-3 md:grid-cols-3">
        {/* Gallery (2 cols on md+) */}
        <div className="md:col-span-2">
          <BrushGallery
            activeBrushId={state.brushId || currentPreset!.id}
            onSelectAction={(id) => {
              if (BRUSH_BY_ID[id]) setBrushById(id);
            }}
            categories={BRUSH_CATEGORIES}
            showSearch
            enableTagFilter
            favoriteIds={favorites}
            showOnlyFavorites={showFavs}
            onToggleShowOnlyFavorites={setShowFavs}
          />
        </div>

        {/* Settings (1 col on md+) */}
        <div>
          <BrushSettings
            preset={currentPreset!}
            values={state.params || {}}
            onChangeAction={handleChange}
            onReset={() => resetParams()}
          />
        </div>
      </div>
    </div>
  );
}
