// src/data/presets.ts
export type PresetCategory = "book" | "music" | "social" | "ads" | "generic";

export type Preset = {
  id: string;
  label: string;
  width: number;
  height: number;
  starting_scale: number;
  dpi?: number;
  category: PresetCategory;
  tags?: string[];
  popularity?: number; // bigger = shown first
};

export const PRESETS: Preset[] = [
  // — Books —
  {
    id: "kdp-ebook",
    label: "KDP eBook (Front)",
    width: 1600,
    height: 2560,
    category: "book",
    popularity: 90,
    starting_scale: 0.4,
    tags: ["ebook", "kindle"],
  },
  {
    id: "kdp-6x9-paperback-front",
    label: "KDP 6×9 Paperback (Front)",
    width: 2550,
    height: 3300,
    dpi: 300,
    category: "book",
    popularity: 80,
    starting_scale: 0.4,
  },
  // — Music —
  {
    id: "album-square-3k",
    label: "Album Cover (3000×3000)",
    width: 3000,
    height: 3000,
    category: "music",
    popularity: 90,
    starting_scale: 0.4,
  },
  {
    id: "vinyl-square-4k",
    label: "Vinyl Artwork (4000×4000)",
    width: 4000,
    height: 4000,
    category: "music",
    popularity: 70,
    starting_scale: 0.4,
  },
  // — Social —
  {
    id: "insta-post",
    label: "Instagram Post (1080×1080)",
    width: 1080,
    height: 1080,
    category: "social",
    popularity: 95,
    starting_scale: 0.6,
  },
  {
    id: "x-header",
    label: "X / Twitter Header (1500×500)",
    width: 1500,
    height: 500,
    category: "social",
    popularity: 80,
    starting_scale: 0.6,
  },
  {
    id: "yt-thumb",
    label: "YouTube Thumbnail (1280×720)",
    width: 1280,
    height: 720,
    category: "social",
    popularity: 90,
    starting_scale: 0.6,
  },
  // — Ads —
  {
    id: "fb-feed-1200x628",
    label: "Facebook Feed (1200×628)",
    width: 1200,
    height: 628,
    category: "ads",
    popularity: 70,
    starting_scale: 0.6,
  },
];

export function defaultPresetForProjectType(
  projectType: string | undefined
): Preset {
  const map: Record<string, (p: Preset) => boolean> = {
    book: (p) => p.category === "book",
    music: (p) => p.category === "music",
    social: (p) => p.category === "social",
    ads: (p) => p.category === "ads",
  };
  const key = (projectType ?? "").toLowerCase();
  const predicate =
    map[key] ??
    ((p: Preset) => p.category === "generic" || p.category === "social");
  const candidates = PRESETS.filter(predicate).sort(
    (a, b) => (b.popularity ?? 0) - (a.popularity ?? 0)
  );
  return candidates[0] ?? PRESETS[0];
}
