// src/data/presets.ts
export type PresetCategory =
  | "book"
  | "music"
  | "social"
  | "ads"
  | "product"
  | "branding"
  | "generic";

export type PresetPlatform =
  | "instagram"
  | "facebook"
  | "x"
  | "linkedin"
  | "youtube"
  | "tiktok"
  | "pinterest"
  | "amazon"
  | "etsy"
  | "shopify"
  | "google"
  | "kdp"
  | "ingram"
  | "bn"
  | "acx"
  | "wattpad"
  | "none";

export type Preset = {
  id: string;
  label: string;
  width: number;
  height: number;
  starting_scale: number;
  dpi?: number;
  category: PresetCategory; // broad bucket for your app’s flows
  platform?: PresetPlatform; // specific destination (for filtering/UX)
  tags?: string[];
  popularity?: number; // bigger = shown first
  aliases?: string[];
};

// --- smart default for starting_scale (based on longest edge) ---
const autoScale = (w: number, h: number) => {
  if (h <= 800) return 0.8;
  if (h <= 1200) return 0.6;
  if (h <= 2000) return 0.5;
  if (h <= 3000) return 0.4;
  return 0.8;
};

export const PRESET_PLACEHOLDER: Preset = {
  id: "select-size",
  label: "— Select a size —",
  width: 0,
  height: 0,
  category: "generic",
  platform: "none",
  starting_scale: 0.8,
  popularity: 9999,
};

export const PRESETS: Preset[] = [
  // ————— Books & Publishing —————
  {
    id: "kdp-ebook",
    label: "eBook — KDP (1600×2560)",
    width: 1600,
    height: 2560,
    category: "book",
    platform: "kdp",
    popularity: 95,
    starting_scale: autoScale(1600, 2560),
    tags: ["ebook", "kindle"],
  },
  {
    id: "ebook-universal-1600x2400",
    label: "eBook — Universal (1600×2400)",
    width: 1600,
    height: 2400,
    category: "book",
    popularity: 80,
    starting_scale: autoScale(1600, 2400),
  },
  {
    id: "kdp-6x9-paperback-front",
    label: "Print Mockup — Front 6×9in (1800×2700)",
    width: 1800, // 6×9 @ 300dpi
    height: 2700,
    dpi: 300,
    category: "book",
    popularity: 70,
    starting_scale: autoScale(1800, 2700),
  },
  {
    id: "wattpad-512x800",
    label: "Wattpad Cover (512×800)",
    width: 512,
    height: 800,
    category: "book",
    platform: "wattpad",
    starting_scale: autoScale(512, 800),
  },
  {
    id: "acx-3000x3000",
    label: "Audiobook — ACX/Audible (3000×3000)",
    width: 3000,
    height: 3000,
    category: "book",
    platform: "acx",
    popularity: 75,
    starting_scale: autoScale(3000, 3000),
  },

  // ————— Music / Artwork —————
  {
    id: "album-square-3k",
    label: "Album Cover (3000×3000)",
    width: 3000,
    height: 3000,
    category: "music",
    popularity: 90,
    starting_scale: autoScale(3000, 3000),
  },
  {
    id: "vinyl-square-4k",
    label: "Vinyl Artwork (4000×4000)",
    width: 4000,
    height: 4000,
    category: "music",
    popularity: 70,
    starting_scale: autoScale(4000, 4000),
  },

  // ————— Social: Instagram —————
  {
    id: "ig-feed-portrait-1080x1350",
    label: "Instagram Feed — Portrait (1080×1350)",
    width: 1080,
    height: 1350,
    category: "social",
    platform: "instagram",
    popularity: 90,
    starting_scale: autoScale(1080, 1350),
  },
  {
    id: "ig-feed-square-1080x1080",
    label: "Instagram Feed — Square (1080×1080)",
    width: 1080,
    height: 1080,
    category: "social",
    platform: "instagram",
    popularity: 95,
    starting_scale: autoScale(1080, 1080),
  },
  {
    id: "ig-feed-landscape-1080x566",
    label: "Instagram Feed — Landscape (1080×566)",
    width: 1080,
    height: 566,
    category: "social",
    platform: "instagram",
    starting_scale: autoScale(1080, 566),
  },
  {
    id: "ig-story-reel-1080x1920",
    label: "Instagram Stories/Reels (1080×1920)",
    width: 1080,
    height: 1920,
    category: "social",
    platform: "instagram",
    popularity: 85,
    starting_scale: autoScale(1080, 1920),
  },

  // ————— Social: Facebook —————
  {
    id: "fb-feed-1080x1080",
    label: "Facebook Feed — Square (1080×1080)",
    width: 1080,
    height: 1080,
    category: "social",
    platform: "facebook",
    starting_scale: autoScale(1080, 1080),
  },
  {
    id: "fb-feed-1200x630",
    label: "Facebook Feed — Landscape (1200×630)",
    width: 1200,
    height: 630,
    category: "social",
    platform: "facebook",
    starting_scale: autoScale(1200, 630),
  },
  {
    id: "fb-story-1080x1920",
    label: "Facebook Story (1080×1920)",
    width: 1080,
    height: 1920,
    category: "social",
    platform: "facebook",
    starting_scale: autoScale(1080, 1920),
  },
  {
    id: "fb-cover-820x360",
    label: "Facebook Page Cover (820×360)",
    width: 820,
    height: 360,
    category: "branding",
    platform: "facebook",
    starting_scale: autoScale(820, 360),
  },
  {
    id: "fb-event-1920x1005",
    label: "Facebook Event Cover (1920×1005)",
    width: 1920,
    height: 1005,
    category: "branding",
    platform: "facebook",
    starting_scale: autoScale(1920, 1005),
  },

  // ————— Social: X / Twitter —————
  {
    id: "x-post-1200x675",
    label: "X/Twitter Post (1200×675)",
    width: 1200,
    height: 675,
    category: "social",
    platform: "x",
    starting_scale: autoScale(1200, 675),
  },
  {
    id: "x-header-1500x500",
    label: "X/Twitter Header (1500×500)",
    width: 1500,
    height: 500,
    category: "branding",
    platform: "x",
    starting_scale: autoScale(1500, 500),
  },
  {
    id: "x-avatar-400x400",
    label: "X/Twitter Profile (400×400)",
    width: 400,
    height: 400,
    category: "branding",
    platform: "x",
    starting_scale: autoScale(400, 400),
  },

  // ————— Social: LinkedIn —————
  {
    id: "li-post-1200x1350",
    label: "LinkedIn Post — Portrait (1200×1350)",
    width: 1200,
    height: 1350,
    category: "social",
    platform: "linkedin",
    starting_scale: autoScale(1200, 1350),
  },
  {
    id: "li-linkshare-1200x627",
    label: "LinkedIn Link Share (1200×627)",
    width: 1200,
    height: 627,
    category: "social",
    platform: "linkedin",
    starting_scale: autoScale(1200, 627),
  },
  {
    id: "li-cover-personal-1584x396",
    label: "LinkedIn Cover — Personal (1584×396)",
    width: 1584,
    height: 396,
    category: "branding",
    platform: "linkedin",
    starting_scale: autoScale(1584, 396),
  },
  {
    id: "li-cover-company-1128x191",
    label: "LinkedIn Cover — Company (1128×191)",
    width: 1128,
    height: 191,
    category: "branding",
    platform: "linkedin",
    starting_scale: autoScale(1128, 191),
  },
  {
    id: "li-logo-300x300",
    label: "LinkedIn Company Logo (300×300)",
    width: 300,
    height: 300,
    category: "branding",
    platform: "linkedin",
    starting_scale: autoScale(300, 300),
  },

  // ————— Social: YouTube —————
  {
    id: "yt-thumb-1280x720",
    label: "YouTube Thumbnail (1280×720)",
    width: 1280,
    height: 720,
    category: "social",
    platform: "youtube",
    popularity: 90,
    starting_scale: autoScale(1280, 720),
  },
  {
    id: "yt-channel-2560x1440",
    label: "YouTube Channel Art (2560×1440)",
    width: 2560,
    height: 1440,
    category: "branding",
    platform: "youtube",
    starting_scale: autoScale(2560, 1440),
  },

  // ————— Social: TikTok —————
  {
    id: "tt-video-cover-1080x1920",
    label: "TikTok Video / Cover (1080×1920)",
    width: 1080,
    height: 1920,
    category: "social",
    platform: "tiktok",
    starting_scale: autoScale(1080, 1920),
  },

  // ————— Social: Pinterest —————
  {
    id: "pin-standard-1000x1500",
    label: "Pinterest Pin — Standard (1000×1500)",
    width: 1000,
    height: 1500,
    category: "social",
    platform: "pinterest",
    starting_scale: autoScale(1000, 1500),
  },
  {
    id: "pin-square-1000x1000",
    label: "Pinterest Pin — Square (1000×1000)",
    width: 1000,
    height: 1000,
    category: "social",
    platform: "pinterest",
    starting_scale: autoScale(1000, 1000),
  },
  {
    id: "pin-long-1000x2100",
    label: "Pinterest Pin — Long (1000×2100)",
    width: 1000,
    height: 2100,
    category: "social",
    platform: "pinterest",
    starting_scale: autoScale(1000, 2100),
  },

  // ————— Product: Amazon —————
  {
    id: "amz-product-2000x2000",
    label: "Amazon Product — Square (2000×2000)",
    width: 2000,
    height: 2000,
    category: "product",
    platform: "amazon",
    starting_scale: autoScale(2000, 2000),
  },
  {
    id: "amz-product-2560x2560",
    label: "Amazon Product — Square (2560×2560)",
    width: 2560,
    height: 2560,
    category: "product",
    platform: "amazon",
    starting_scale: autoScale(2560, 2560),
  },
  // A+ Content (common modules)
  {
    id: "amz-a-plus-standard-970x300",
    label: "Amazon A+ — Standard Banner (970×300)",
    width: 970,
    height: 300,
    category: "product",
    platform: "amazon",
    starting_scale: autoScale(970, 300),
  },
  {
    id: "amz-a-plus-premium-1464x600",
    label: "Amazon A+ — Premium Full Image (1464×600)",
    width: 1464,
    height: 600,
    category: "product",
    platform: "amazon",
    starting_scale: autoScale(1464, 600),
  },
  {
    id: "amz-brand-story-1464x625",
    label: "Amazon Brand Story — Background (1464×625)",
    width: 1464,
    height: 625,
    category: "product",
    platform: "amazon",
    starting_scale: autoScale(1464, 625),
  },
  {
    id: "amz-brand-story-mobile-463x625",
    label: "Amazon Brand Story — Mobile (463×625)",
    width: 463,
    height: 625,
    category: "product",
    platform: "amazon",
    starting_scale: autoScale(463, 625),
  },
  // Storefront
  {
    id: "amz-store-hero-3000x600",
    label: "Amazon Storefront — Hero (3000×600)",
    width: 3000,
    height: 600,
    category: "branding",
    platform: "amazon",
    starting_scale: autoScale(3000, 600),
  },
  {
    id: "amz-store-logo-400x400",
    label: "Amazon Storefront — Logo (400×400)",
    width: 400,
    height: 400,
    category: "branding",
    platform: "amazon",
    starting_scale: autoScale(400, 400),
  },

  // ————— Product: Etsy / Shopify —————
  {
    id: "etsy-listing-2000x2000",
    label: "Etsy Listing — Square (2000×2000)",
    width: 2000,
    height: 2000,
    category: "product",
    platform: "etsy",
    starting_scale: autoScale(2000, 2000),
  },
  {
    id: "shopify-product-2048x2048",
    label: "Shopify Product — Square (2048×2048)",
    width: 2048,
    height: 2048,
    category: "product",
    platform: "shopify",
    starting_scale: autoScale(2048, 2048),
  },

  // ————— Ads: Google Display Network (static) —————
  {
    id: "gads-300x250",
    label: "Google Ad — Medium Rectangle(300×250)",
    width: 300,
    height: 250,
    category: "ads",
    platform: "google",
    starting_scale: autoScale(300, 250),
  },
  {
    id: "gads-336x280",
    label: "Google Ad — Large Rectangle(336×280)",
    width: 336,
    height: 280,
    category: "ads",
    platform: "google",
    starting_scale: autoScale(336, 280),
  },
  {
    id: "gads-728x90",
    label: "Google Ad — Leaderboard (728×90)",
    width: 728,
    height: 90,
    category: "ads",
    platform: "google",
    starting_scale: autoScale(728, 90),
  },
  {
    id: "gads-970x250",
    label: "Google Ad — Billboard (970×250)",
    width: 970,
    height: 250,
    category: "ads",
    platform: "google",
    starting_scale: autoScale(970, 250),
  },
  {
    id: "gads-300x600",
    label: "Google Ad — Half Page (300×600)",
    width: 300,
    height: 600,
    category: "ads",
    platform: "google",
    starting_scale: autoScale(300, 600),
  },
  {
    id: "gads-160x600",
    label: "Google Ad — Wide Skyscraper (160×600)",
    width: 160,
    height: 600,
    category: "ads",
    platform: "google",
    starting_scale: autoScale(160, 600),
  },
  {
    id: "gads-320x100",
    label: "Google Ad — Large Mobile Banner (320×100)",
    width: 320,
    height: 100,
    category: "ads",
    platform: "google",
    starting_scale: autoScale(320, 100),
  },
  {
    id: "gads-468x60",
    label: "Google Ad — Banner (468×60)",
    width: 468,
    height: 60,
    category: "ads",
    platform: "google",
    starting_scale: autoScale(468, 60),
  },
  {
    id: "gads-250x250",
    label: "Google Ad — Square (250×250)",
    width: 250,
    height: 250,
    category: "ads",
    platform: "google",
    starting_scale: autoScale(250, 250),
  },
  {
    id: "gads-200x200",
    label: "Google Ad — Small Square (200×200)",
    width: 200,
    height: 200,
    category: "ads",
    platform: "google",
    starting_scale: autoScale(200, 200),
  },
];

// Default: start with a neutral “select a size” in the UI.
// (If you prefer the old behavior, switch back to the category-based pick below.)
export function defaultPresetForProjectType(_projectType?: string): Preset {
  void _projectType;
  return PRESET_PLACEHOLDER;
}

/*
// If you want the old auto-pick behavior instead of the placeholder:
export function defaultPresetForProjectType(projectType: string | undefined): Preset {
  const map: Record<string, (p: Preset) => boolean> = {
    book: (p) => p.category === "book",
    music: (p) => p.category === "music",
    social: (p) => p.category === "social",
    ads: (p) => p.category === "ads",
    product: (p) => p.category === "product",
    branding: (p) => p.category === "branding",
  };
  const key = (projectType ?? "").toLowerCase();
  const predicate = map[key] ?? ((p: Preset) => p.category === "generic" || p.category === "social");
  const candidates = PRESETS.filter(predicate).sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
  return candidates[0] ?? PRESETS[0];
}
*/
