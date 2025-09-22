// src/components/editor/tools/BrushFilters.tsx
"use client";

import * as React from "react";

export type BrushFiltersProps = {
  /** Current search query (controlled). */
  query: string;
  onQueryChange: (q: string) => void;

  /** Favorites (controlled). If undefined, the toggle is hidden. */
  showOnlyFavorites?: boolean;
  onToggleShowOnlyFavorites?: (next: boolean) => void;

  /** Tag filtering (controlled). If availableTags is empty/omitted, the tag bar is hidden. */
  availableTags?: readonly string[];
  selectedTags?: ReadonlySet<string>;
  onToggleTag?: (tag: string) => void;
  onClearTags?: () => void;

  /** Show/hide UI parts. All default to true, but hide automatically if handlers/data are missing. */
  showSearch?: boolean;
  showFavoriteToggle?: boolean;
  showTagFilter?: boolean;

  /** Optional styling/layout */
  className?: string;
  inputPlaceholder?: string;
  /** Request tighter spacing (useful on mobile) */
  compact?: boolean;
};

/**
 * Presentational filter bar used above the BrushGallery grid.
 * - Fully controlled; no React hooks/state inside.
 * - Hides sections automatically when handlers/data are not provided.
 */
export function BrushFilters({
  query,
  onQueryChange,

  showOnlyFavorites,
  onToggleShowOnlyFavorites,

  availableTags = [],
  selectedTags,
  onToggleTag,
  onClearTags,

  showSearch = true,
  showFavoriteToggle = true,
  showTagFilter = true,

  className,
  inputPlaceholder = "Search brushes…",
  compact = false,
}: BrushFiltersProps) {
  const canShowSearch = showSearch && typeof onQueryChange === "function";
  const canShowFavToggle =
    showFavoriteToggle &&
    typeof onToggleShowOnlyFavorites === "function" &&
    typeof showOnlyFavorites === "boolean";
  const canShowTags =
    showTagFilter &&
    Array.isArray(availableTags) &&
    availableTags.length > 0 &&
    typeof onToggleTag === "function";

  return (
    <div
      className={[
        "w-full",
        // keep vertical rhythm predictable; outer wrapper decides row spacing
        "space-y-2",
        className ?? "",
      ].join(" ")}
    >
      {/* Desktop toolbar */}
      {(canShowSearch || canShowFavToggle || canShowTags) && (
        <div
          className={[
            "hidden md:flex items-center justify-between gap-2",
            compact ? "py-1" : "",
          ].join(" ")}
        >
          <div className="flex items-center gap-2">
            {canShowSearch && (
              <input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder={inputPlaceholder}
                className={
                  compact
                    ? "h-8 w-56 rounded-md border bg-background px-2 text-sm"
                    : "h-8 w-64 rounded-md border bg-background px-2 text-sm"
                }
                aria-label="Search brushes"
              />
            )}
            {canShowFavToggle && (
              <label className="flex select-none items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-primary"
                  checked={!!showOnlyFavorites}
                  onChange={(e) =>
                    onToggleShowOnlyFavorites?.(e.target.checked)
                  }
                />
                Favorites only
              </label>
            )}
          </div>

          {canShowTags && (
            <TagBar
              tags={availableTags}
              selected={selectedTags}
              onToggle={onToggleTag}
              onClear={onClearTags}
              compact={compact}
            />
          )}
        </div>
      )}

      {/* Mobile toolbar (compact) */}
      {(canShowSearch || canShowFavToggle) && (
        <div className="flex items-center justify-between gap-2 md:hidden">
          {canShowSearch && (
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search…"
              className="h-8 w-full rounded-md border bg-background px-2 text-sm"
              aria-label="Search brushes"
            />
          )}
          {canShowFavToggle && (
            <label className="ml-2 flex select-none items-center gap-2 text-xs">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-primary"
                checked={!!showOnlyFavorites}
                onChange={(e) => onToggleShowOnlyFavorites?.(e.target.checked)}
              />
              Fav
            </label>
          )}
        </div>
      )}

      {/* Mobile tag bar under the inputs */}
      {canShowTags && (
        <div className="md:hidden">
          <TagBar
            tags={availableTags}
            selected={selectedTags}
            onToggle={onToggleTag}
            onClear={onClearTags}
            compact
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Subcomponents ------------------------------ */

function TagBar({
  tags,
  selected,
  onToggle,
  onClear,
  compact = false,
}: {
  tags: readonly string[];
  selected?: ReadonlySet<string>;
  onToggle?: (tag: string) => void;
  onClear?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={[
        "flex flex-wrap items-center gap-1",
        compact ? "pt-1" : "",
      ].join(" ")}
    >
      {tags.map((t) => {
        const active = selected?.has(t) ?? false;
        return (
          <button
            key={t}
            onClick={() => onToggle?.(t)}
            className={[
              "rounded-full border px-2 py-0.5 text-[11px]",
              active
                ? "border-primary/60 bg-primary/10"
                : "text-muted-foreground hover:bg-muted/40",
            ].join(" ")}
            title={`Filter: ${t}`}
            aria-pressed={active}
            type="button"
          >
            {t}
          </button>
        );
      })}
      {(selected?.size ?? 0) > 0 && (
        <button
          onClick={() => onClear?.()}
          className="ml-1 text-[11px] text-muted-foreground hover:underline"
          title="Clear tag filters"
          type="button"
        >
          Clear
        </button>
      )}
    </div>
  );
}
