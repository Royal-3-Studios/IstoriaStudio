// src/components/editor/tools/BrushGallery.tsx
"use client";

import * as React from "react";
import {
  BRUSH_CATEGORIES,
  type BrushCategory,
  type BrushPreset,
} from "@/data/brushPresets";
import { BrushCard } from "./BrushCard";
import { BrushFilters } from "./BrushFilters";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Optional extension your generator can emit; safe for brushes that don’t have tags. */
export type BrushPresetWithTags = BrushPreset & {
  readonly tags?: readonly string[];
};

export type BrushGalleryProps = {
  activeBrushId: string;
  onSelectAction: (id: string) => void;
  categories?: readonly BrushCategory[];

  /** Optional UX; if omitted, the UI behaves like before. */
  showSearch?: boolean;
  enableTagFilter?: boolean;

  /** Favorites filter is inert until wired by caller. Leave undefined to hide the toggle. */
  favoriteIds?: ReadonlySet<string>;
  showOnlyFavorites?: boolean;
  onToggleShowOnlyFavorites?: (next: boolean) => void;
};

/* ---------- tiny type helpers ---------- */
function hasTags(b: BrushPreset): b is BrushPresetWithTags {
  return Array.isArray((b as BrushPresetWithTags).tags);
}
function getTags(b: BrushPreset): readonly string[] {
  return hasTags(b) ? b.tags ?? [] : [];
}

export function BrushGallery({
  activeBrushId,
  onSelectAction,
  categories = BRUSH_CATEGORIES,
  showSearch = false,
  enableTagFilter = false,
  favoriteIds,
  showOnlyFavorites = false,
  onToggleShowOnlyFavorites,
}: BrushGalleryProps) {
  // Hooks are always called (no early returns)
  const [catId, setCatId] = React.useState<string>(
    () => categories[0]?.id ?? ""
  );
  const [query, setQuery] = React.useState<string>("");
  const [selectedTags, setSelectedTags] = React.useState<Set<string>>(
    () => new Set()
  );

  const hasCategories = categories.length > 0;

  // Keep selected category valid if the list changes
  React.useEffect(() => {
    if (!categories.length) {
      setCatId("");
      return;
    }
    if (!categories.some((c) => c.id === catId)) {
      setCatId(categories[0].id);
    }
  }, [categories, catId]);

  // Safe current category (never undefined downstream)
  const currentCategory: BrushCategory = React.useMemo(
    () =>
      (hasCategories
        ? categories.find((c) => c.id === catId) ?? categories[0]
        : { id: "", name: "", brushes: [] }) as BrushCategory,
    [hasCategories, categories, catId]
  );

  const availableTags: readonly string[] = React.useMemo(() => {
    if (!enableTagFilter) return [];
    const s = new Set<string>();
    for (const b of currentCategory.brushes) {
      for (const t of getTags(b)) s.add(String(t));
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [enableTagFilter, currentCategory]);

  const filteredBrushes: readonly BrushPreset[] = React.useMemo(() => {
    let list: readonly BrushPreset[] = currentCategory.brushes;

    if (favoriteIds && showOnlyFavorites) {
      list = list.filter((b) => favoriteIds.has(b.id));
    }

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((b) => {
        const name = b.name?.toLowerCase() ?? "";
        const sub = b.subtitle?.toLowerCase() ?? "";
        const id = b.id?.toLowerCase() ?? "";
        const tags = getTags(b).map((t) => t.toLowerCase());
        return (
          name.includes(q) ||
          sub.includes(q) ||
          id.includes(q) ||
          tags.some((t) => t.includes(q))
        );
      });
    }

    if (enableTagFilter && selectedTags.size) {
      list = list.filter((b) => {
        const tags = new Set(getTags(b));
        for (const t of selectedTags) if (!tags.has(t)) return false;
        return true;
      });
    }

    return list;
  }, [
    currentCategory,
    favoriteIds,
    showOnlyFavorites,
    query,
    enableTagFilter,
    selectedTags,
  ]);

  const handleToggleTag = React.useCallback((tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }, []);

  const handleClearTags = React.useCallback(() => {
    setSelectedTags(new Set());
  }, []);

  return (
    <div className="w-full space-y-2">
      {/* Optional toolbar (desktop) */}
      {(showSearch || onToggleShowOnlyFavorites || enableTagFilter) && (
        <div className="hidden items-center justify-between gap-2 md:flex">
          <BrushFilters
            query={query}
            onQueryChange={setQuery}
            showOnlyFavorites={showOnlyFavorites}
            onToggleShowOnlyFavorites={onToggleShowOnlyFavorites}
            availableTags={enableTagFilter ? availableTags : []}
            selectedTags={selectedTags}
            onToggleTag={handleToggleTag}
            onClearTags={handleClearTags}
          />
        </div>
      )}

      {/* Mobile: filters + category select + grid */}
      <div className="md:hidden space-y-2">
        {(showSearch || onToggleShowOnlyFavorites || enableTagFilter) && (
          <BrushFilters
            query={query}
            onQueryChange={setQuery}
            showOnlyFavorites={showOnlyFavorites}
            onToggleShowOnlyFavorites={onToggleShowOnlyFavorites}
            availableTags={enableTagFilter ? availableTags : []}
            selectedTags={selectedTags}
            onToggleTag={handleToggleTag}
            onClearTags={handleClearTags}
          />
        )}

        <Select value={catId} onValueChange={(v) => setCatId(v)}>
          <SelectTrigger className="h-8 w-full">
            <SelectValue placeholder="Brush category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-sm">
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <CategoryGrid
          brushes={filteredBrushes}
          activeBrushId={activeBrushId}
          onSelectAction={onSelectAction}
        />
      </div>

      {/* Desktop/Tablet: Tabs + grid */}
      <div className="hidden md:block">
        <Tabs
          value={catId}
          onValueChange={(v) => setCatId(v)}
          className="w-full"
        >
          <TabsList className="flex flex-wrap justify-start gap-1">
            {categories.map((c) => (
              <TabsTrigger key={c.id} value={c.id} className="text-xs">
                {c.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {categories.map((c) => (
            <TabsContent key={c.id} value={c.id} className="mt-2">
              <CategoryGrid
                brushes={
                  c.id === currentCategory.id ? filteredBrushes : c.brushes
                }
                activeBrushId={activeBrushId}
                onSelectAction={onSelectAction}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {!hasCategories && (
        <div className="text-sm text-muted-foreground">
          No brush categories available.
        </div>
      )}
    </div>
  );
}

/* ---------- Grid ---------- */
function CategoryGrid({
  brushes,
  activeBrushId,
  onSelectAction,
}: {
  brushes: readonly BrushPreset[];
  activeBrushId: string;
  onSelectAction: (id: string) => void;
}) {
  if (!brushes.length) {
    return (
      <div className="text-sm text-muted-foreground">No brushes found.</div>
    );
  }

  return (
    <div
      className="grid gap-6"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}
    >
      {brushes.map((b) => (
        <BrushCard
          key={b.id}
          preset={b}
          selected={b.id === activeBrushId}
          onSelect={onSelectAction}
        />
      ))}
    </div>
  );
}
