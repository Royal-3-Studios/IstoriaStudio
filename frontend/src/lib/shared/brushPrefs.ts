// FILE: src/data/brushPrefs.ts

/**
 * Lightweight, SSR-safe preference storage for the brush tool.
 * - Persists to localStorage (when available)
 * - Tracks favorites, recents, lastBrushId, and "favorites only" UI toggle
 * - Includes pure helpers + a React hook for convenience
 */

export type BrushPrefs = {
  /** Favorited brush ids */
  favorites: string[];
  /** Maintain MRU order of recently used brushes (most recent first) */
  recents: string[];
  /** Last active brush id (used for restoring on load) */
  lastBrushId?: string;
  /** UI toggle: show only favorite brushes in the gallery */
  showOnlyFavorites?: boolean;

  /** Schema/versioning */
  __v: 1;
};

const PREFS_KEY = "brush:prefs:v1";

/* ----------------------------- SSR-safe storage ----------------------------- */

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readStorage<T>(key: string): T | undefined {
  if (!hasStorage()) return undefined;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function writeStorage<T>(key: string, value: T): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / privacy errors
  }
}

/* -------------------------------- Defaults -------------------------------- */

export const defaultBrushPrefs = (): BrushPrefs => ({
  favorites: [],
  recents: [],
  lastBrushId: undefined,
  showOnlyFavorites: false,
  __v: 1,
});

/* --------------------------------- Load/Save -------------------------------- */

export function loadBrushPrefs(): BrushPrefs {
  // Load current schema
  const current = readStorage<BrushPrefs>(PREFS_KEY);
  if (isValidPrefs(current)) return current;

  // Migrate older schemas here if you had any (stub for future changes)
  // Example legacy keys:
  const legacy = tryLoadLegacy();
  if (legacy) return persist(legacy);

  // Fallback to defaults
  return persist(defaultBrushPrefs());
}

export function saveBrushPrefs(next: BrushPrefs): BrushPrefs {
  return persist(sanitize(next));
}

function persist(p: BrushPrefs): BrushPrefs {
  const clean = sanitize(p);
  writeStorage(PREFS_KEY, clean);
  return clean;
}

/* ----------------------------- Type guards/utils ---------------------------- */

function isValidPrefs(v: unknown): v is BrushPrefs {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<BrushPrefs>;
  return (
    p.__v === 1 &&
    Array.isArray(p.favorites) &&
    Array.isArray(p.recents) &&
    (p.lastBrushId === undefined || typeof p.lastBrushId === "string") &&
    (p.showOnlyFavorites === undefined ||
      typeof p.showOnlyFavorites === "boolean")
  );
}

function sanitize(p: BrushPrefs): BrushPrefs {
  const favs = dedupeStringArray(p.favorites);
  const rec = dedupeStringArray(p.recents);
  return {
    __v: 1,
    favorites: favs,
    recents: rec,
    lastBrushId: typeof p.lastBrushId === "string" ? p.lastBrushId : undefined,
    showOnlyFavorites: !!p.showOnlyFavorites,
  };
}

function dedupeStringArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const it of arr) {
    const s = String(it ?? "");
    if (!s) continue;
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/* ------------------------------- Legacy loader ------------------------------ */

function tryLoadLegacy(): BrushPrefs | undefined {
  // If you previously stored under other keys, migrate here.
  // Example:
  // const old = readStorage<any>("brush:prefs");
  // if (old && Array.isArray(old.favorites)) {
  //   return sanitize({
  //     __v: 1,
  //     favorites: old.favorites,
  //     recents: old.recents ?? [],
  //     lastBrushId: old.lastBrushId,
  //     showOnlyFavorites: !!old.showOnlyFavorites,
  //   });
  // }
  return undefined;
}

/* ------------------------------- Pure helpers ------------------------------- */

export function getFavoritesSet(prefs: BrushPrefs): ReadonlySet<string> {
  return new Set(prefs.favorites);
}

export function isFavorite(prefs: BrushPrefs, id: string): boolean {
  return prefs.favorites.includes(id);
}

export function toggleFavorite(prefs: BrushPrefs, id: string): BrushPrefs {
  const set = new Set(prefs.favorites);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return saveBrushPrefs({ ...prefs, favorites: Array.from(set) });
}

export function addFavorite(prefs: BrushPrefs, id: string): BrushPrefs {
  if (isFavorite(prefs, id)) return prefs;
  return saveBrushPrefs({ ...prefs, favorites: [...prefs.favorites, id] });
}

export function removeFavorite(prefs: BrushPrefs, id: string): BrushPrefs {
  if (!isFavorite(prefs, id)) return prefs;
  return saveBrushPrefs({
    ...prefs,
    favorites: prefs.favorites.filter((x) => x !== id),
  });
}

export function setShowOnlyFavorites(
  prefs: BrushPrefs,
  next: boolean
): BrushPrefs {
  return saveBrushPrefs({ ...prefs, showOnlyFavorites: !!next });
}

export function setLastBrushId(
  prefs: BrushPrefs,
  id: string | undefined
): BrushPrefs {
  return saveBrushPrefs({ ...prefs, lastBrushId: id });
}

export function pushRecent(
  prefs: BrushPrefs,
  id: string,
  max = 20
): BrushPrefs {
  const list = [id, ...prefs.recents.filter((x) => x !== id)];
  if (list.length > max) list.length = max;
  return saveBrushPrefs({ ...prefs, recents: list });
}

/* ----------------------------- React convenience ---------------------------- */

import * as React from "react";

/**
 * React hook that:
 * - Initializes from localStorage (SSR-safe)
 * - Saves on change
 * - Listens to `storage` events for cross-tab sync
 */
export function useBrushPrefs() {
  const [prefs, setPrefs] = React.useState<BrushPrefs>(() => loadBrushPrefs());

  // Save on change
  React.useEffect(() => {
    saveBrushPrefs(prefs);
  }, [prefs]);

  // Cross-tab sync
  React.useEffect(() => {
    if (!hasStorage()) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === PREFS_KEY) {
        const next = loadBrushPrefs();
        // shallow compare to avoid loops
        if (!shallowEqualPrefs(prefs, next)) {
          setPrefs(next);
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [prefs]);

  // Derived helpers bound to state setter
  const { favorites } = prefs;

  const favoritesSet = React.useMemo(() => new Set(favorites), [favorites]);

  const api = React.useMemo(() => {
    return {
      setShowFavs: (next: boolean) =>
        setPrefs((p) => setShowOnlyFavorites(p, next)),
      toggleFavorite: (id: string) => setPrefs((p) => toggleFavorite(p, id)),
      addFavorite: (id: string) => setPrefs((p) => addFavorite(p, id)),
      removeFavorite: (id: string) => setPrefs((p) => removeFavorite(p, id)),
      setLastBrushId: (id: string | undefined) =>
        setPrefs((p) => setLastBrushId(p, id)),
      pushRecent: (id: string, max = 20) =>
        setPrefs((p) => pushRecent(p, id, max)),
      replaceAll: (next: BrushPrefs) => setPrefs(saveBrushPrefs(next)),
    };
  }, []);

  return { prefs, setPrefs, favoritesSet, ...api } as const;
}

function shallowEqualPrefs(a: BrushPrefs, b: BrushPrefs): boolean {
  return (
    a.__v === b.__v &&
    a.lastBrushId === b.lastBrushId &&
    a.showOnlyFavorites === b.showOnlyFavorites &&
    arrEqual(a.favorites, b.favorites) &&
    arrEqual(a.recents, b.recents)
  );
}

function arrEqual(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
