// src/data/presets.ts

/* ============================
 * Types
 * ============================ */

export type PresetCategory =
  | "app"
  | "book"
  | "music"
  | "social"
  | "ads"
  | "product"
  | "branding"
  | "generic"
  | "comic"
  | "icon"
  | "email"
  | "web"
  | "webtoon"
  | "wallpaper"
  | "streaming"
  | "document"
  | "presentation";

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
  | "twitch" // NEW
  | "kick" // NEW
  | "powerpoint" // NEW (presentation program)
  | "none";

export type Orientation = "portrait" | "landscape" | "square";
export type Unit = "px" | "in" | "mm";
export type ColorProfile = "sRGB" | "DisplayP3" | "CMYK-ish";

export type PrintBox = {
  unit: Unit; // "in" recommended for print
  trim_w?: number; // trim width (in)
  trim_h?: number; // trim height (in)
  bleed_all?: number; // bleed all sides (in), e.g. 0.125
  safe_margin?: number; // text safe margin (in), e.g. 0.25
};

export type Preset = {
  id: string;
  label: string;

  // Canvas dimensions in pixels
  width: number;
  height: number;

  // Per-device starting scales (all presets include these)
  starting_scale_small: number;
  starting_scale_medium: number;
  starting_scale_large: number;

  dpi?: number;
  category: PresetCategory; // broad bucket for flows
  platform?: PresetPlatform; // specific destination (for filtering/UX)

  // Helpful for filtering & UX
  orientation?: Orientation;
  aspect_ratio?: string; // "2:3", "1:1", "9:16" etc.
  unit?: Unit; // for clarity when displaying print dims
  print?: PrintBox; // only for print-capable presets
  color_profile?: ColorProfile; // display hint; not color-managed

  tags?: string[]; // ["reel","carousel","thumbnail",...]
  popularity?: number;
  aliases?: string[];

  // Workflow helpers
  printable?: boolean; // show print export tips if true
  requires_page_count?: boolean; // e.g., full wrap cover w/spine calc
  recommended_export?: ("JPG" | "PNG" | "TIFF" | "PDF" | "SVG")[];
};

/* ============================
 * Helpers
 * ============================ */

// Simple, readable orientation and aspect helpers (runtime)
const toOrientation = (w: number, h: number): Orientation =>
  w === h ? "square" : w > h ? "landscape" : "portrait";

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const toAspect = (w: number, h: number): string => {
  const g = gcd(w, h);
  return `${Math.round(w / g)}:${Math.round(h / g)}`;
};

// — simple height-based autoscalers (tweak anytime) —
const autoScaleSmall = (w: number, h: number) => {
  if (w <= 900) {
    if (h <= 800) return 0.4;
    if (h <= 1200) return 0.3;
    if (h <= 2000) return 0.2;
    if (h <= 3000) return 0.2;
  } else {
    if (h <= 800) return 0.3;
    if (h <= 1200) return 0.25;
    if (h <= 2000) return 0.2;
    if (h <= 3000) return 0.2;
  }
  return 0.5;
};

const autoScaleMedium = (w: number, h: number) => {
  if (h <= 800) return 0.5;
  if (h <= 1200) return 0.45;
  if (h <= 2000) return 0.35;
  if (h <= 3000) return 0.35;
  return 0.5;
};

const autoScaleLarge = (w: number, h: number) => {
  if (h <= 800) return 0.55;
  if (h <= 1200) return 0.45;
  if (h <= 2000) return 0.35;
  if (h <= 3000) return 0.25;
  return 0.45;
};

/* ============================
 * Placeholder
 * ============================ */

export const PRESET_PLACEHOLDER: Preset = {
  id: "select-size",
  label: "— Select a size —",
  width: 0,
  height: 0,
  category: "generic",
  platform: "none",
  starting_scale_small: 1,
  starting_scale_medium: 1,
  starting_scale_large: 1,
  popularity: 9999,
  orientation: "square",
  aspect_ratio: "1:1",
};

/* ============================
 * Presets
 * ============================ */

export const PRESETS: Preset[] = [
  /* ————— Books & Publishing ————— */

  {
    id: "kdp-ebook",
    label: "eBook — KDP (1600×2560)",
    width: 1600,
    height: 2560,
    dpi: 72,
    category: "book",
    platform: "kdp",
    popularity: 95,
    starting_scale_small: autoScaleSmall(1600, 2560),
    starting_scale_medium: autoScaleMedium(1600, 2560),
    starting_scale_large: autoScaleLarge(1600, 2560),
    orientation: toOrientation(1600, 2560),
    aspect_ratio: toAspect(1600, 2560),
    tags: ["ebook", "kindle", "digital"],
    recommended_export: ["JPG", "PNG", "PDF"],
  },
  {
    id: "ebook-universal-1600x2400",
    label: "eBook — Universal (1600×2400)",
    width: 1600,
    height: 2400,
    category: "book",
    popularity: 80,
    starting_scale_small: autoScaleSmall(1600, 2400),
    starting_scale_medium: autoScaleMedium(1600, 2400),
    starting_scale_large: autoScaleLarge(1600, 2400),
    orientation: toOrientation(1600, 2400),
    aspect_ratio: toAspect(1600, 2400),
    tags: ["ebook", "digital"],
    recommended_export: ["JPG", "PNG", "PDF"],
  },
  {
    id: "kdp-6x9-paperback-front",
    label: "Print Mockup — Front 6×9in (1800×2700)",
    width: 1800,
    height: 2700,
    dpi: 300,
    category: "book",
    popularity: 70,
    starting_scale_small: autoScaleSmall(1800, 2700),
    starting_scale_medium: autoScaleMedium(1800, 2700),
    starting_scale_large: autoScaleLarge(1800, 2700),
    orientation: toOrientation(1800, 2700),
    aspect_ratio: toAspect(1800, 2700),
    printable: true,
    unit: "in",
    print: {
      unit: "in",
      trim_w: 6,
      trim_h: 9,
      bleed_all: 0,
      safe_margin: 0.25,
    },
    tags: ["print", "mockup", "front"],
    recommended_export: ["TIFF", "PNG", "PDF"],
  },
  {
    id: "wattpad-512x800",
    label: "Wattpad Cover (512×800)",
    width: 512,
    height: 800,
    category: "book",
    platform: "wattpad",
    starting_scale_small: autoScaleSmall(512, 800),
    starting_scale_medium: autoScaleMedium(512, 800),
    starting_scale_large: autoScaleLarge(512, 800),
    orientation: toOrientation(512, 800),
    aspect_ratio: toAspect(512, 800),
    tags: ["ebook", "thumbnail", "digital"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "acx-3000x3000",
    label: "Audiobook — ACX/Audible (3000×3000)",
    width: 3000,
    height: 3000,
    category: "book",
    platform: "acx",
    popularity: 75,
    starting_scale_small: autoScaleSmall(3000, 3000),
    starting_scale_medium: autoScaleMedium(3000, 3000),
    starting_scale_large: autoScaleLarge(3000, 3000),
    orientation: "square",
    aspect_ratio: "1:1",
    tags: ["audiobook", "album", "square"],
    recommended_export: ["JPG", "PNG"],
  },

  /* ————— Music / Artwork ————— */

  {
    id: "album-square-3k",
    label: "Album Cover (3000×3000)",
    width: 3000,
    height: 3000,
    category: "music",
    popularity: 90,
    starting_scale_small: autoScaleSmall(3000, 3000),
    starting_scale_medium: autoScaleMedium(3000, 3000),
    starting_scale_large: autoScaleLarge(3000, 3000),
    orientation: "square",
    aspect_ratio: "1:1",
    tags: ["album", "square", "music"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "vinyl-square-4k",
    label: "Vinyl Artwork (4000×4000)",
    width: 4000,
    height: 4000,
    category: "music",
    popularity: 70,
    starting_scale_small: autoScaleSmall(4000, 4000),
    starting_scale_medium: autoScaleMedium(4000, 4000),
    starting_scale_large: autoScaleLarge(4000, 4000),
    orientation: "square",
    aspect_ratio: "1:1",
    tags: ["vinyl", "square", "hires"],
    recommended_export: ["PNG", "TIFF"],
  },

  /* ————— Social: Instagram ————— */

  {
    id: "ig-feed-portrait-1080x1350",
    label: "Instagram Feed — Portrait (1080×1350)",
    width: 1080,
    height: 1350,
    category: "social",
    platform: "instagram",
    popularity: 90,
    starting_scale_small: autoScaleSmall(1080, 1350),
    starting_scale_medium: autoScaleMedium(1080, 1350),
    starting_scale_large: autoScaleLarge(1080, 1350),
    orientation: toOrientation(1080, 1350),
    aspect_ratio: toAspect(1080, 1350),
    tags: ["feed", "portrait"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "ig-feed-square-1080x1080",
    label: "Instagram Feed — Square (1080×1080)",
    width: 1080,
    height: 1080,
    category: "social",
    platform: "instagram",
    popularity: 95,
    starting_scale_small: autoScaleSmall(1080, 1080),
    starting_scale_medium: autoScaleMedium(1080, 1080),
    starting_scale_large: autoScaleLarge(1080, 1080),
    orientation: "square",
    aspect_ratio: "1:1",
    tags: ["feed", "square", "carousel"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "ig-feed-landscape-1080x566",
    label: "Instagram Feed — Landscape (1080×566)",
    width: 1080,
    height: 566,
    category: "social",
    platform: "instagram",
    starting_scale_small: autoScaleSmall(1080, 566),
    starting_scale_medium: autoScaleMedium(1080, 566),
    starting_scale_large: autoScaleLarge(1080, 566),
    orientation: toOrientation(1080, 566),
    aspect_ratio: toAspect(1080, 566),
    tags: ["feed", "landscape"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "ig-story-reel-1080x1920",
    label: "Instagram Stories/Reels (1080×1920)",
    width: 1080,
    height: 1920,
    category: "social",
    platform: "instagram",
    popularity: 85,
    starting_scale_small: autoScaleSmall(1080, 1920),
    starting_scale_medium: autoScaleMedium(1080, 1920),
    starting_scale_large: autoScaleLarge(1080, 1920),
    orientation: toOrientation(1080, 1920),
    aspect_ratio: toAspect(1080, 1920),
    tags: ["story", "reel", "vertical"],
    recommended_export: ["JPG", "PNG"],
  },

  /* ————— Social: Facebook ————— */

  {
    id: "fb-feed-1080x1080",
    label: "Facebook Feed — Square (1080×1080)",
    width: 1080,
    height: 1080,
    category: "social",
    platform: "facebook",
    starting_scale_small: autoScaleSmall(1080, 1080),
    starting_scale_medium: autoScaleMedium(1080, 1080),
    starting_scale_large: autoScaleLarge(1080, 1080),
    orientation: "square",
    aspect_ratio: "1:1",
    tags: ["feed", "square"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "fb-feed-1200x630",
    label: "Facebook Feed — Landscape (1200×630)",
    width: 1200,
    height: 630,
    category: "social",
    platform: "facebook",
    starting_scale_small: autoScaleSmall(1200, 630),
    starting_scale_medium: autoScaleMedium(1200, 630),
    starting_scale_large: autoScaleLarge(1200, 630),
    orientation: toOrientation(1200, 630),
    aspect_ratio: toAspect(1200, 630),
    tags: ["feed", "landscape", "link-share"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "fb-story-1080x1920",
    label: "Facebook Story (1080×1920)",
    width: 1080,
    height: 1920,
    category: "social",
    platform: "facebook",
    starting_scale_small: autoScaleSmall(1080, 1920),
    starting_scale_medium: autoScaleMedium(1080, 1920),
    starting_scale_large: autoScaleLarge(1080, 1920),
    orientation: toOrientation(1080, 1920),
    aspect_ratio: toAspect(1080, 1920),
    tags: ["story", "vertical"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "fb-cover-820x360",
    label: "Facebook Page Cover (820×360)",
    width: 820,
    height: 360,
    category: "branding",
    platform: "facebook",
    starting_scale_small: autoScaleSmall(820, 360),
    starting_scale_medium: autoScaleMedium(820, 360),
    starting_scale_large: autoScaleLarge(820, 360),
    orientation: toOrientation(820, 360),
    aspect_ratio: toAspect(820, 360),
    tags: ["cover", "banner"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "fb-event-1920x1005",
    label: "Facebook Event Cover (1920×1005)",
    width: 1920,
    height: 1005,
    category: "branding",
    platform: "facebook",
    starting_scale_small: autoScaleSmall(1920, 1005),
    starting_scale_medium: autoScaleMedium(1920, 1005),
    starting_scale_large: autoScaleLarge(1920, 1005),
    orientation: toOrientation(1920, 1005),
    aspect_ratio: toAspect(1920, 1005),
    tags: ["cover", "event", "banner"],
    recommended_export: ["JPG", "PNG"],
  },

  /* ————— Social: X / Twitter ————— */

  {
    id: "x-post-1200x675",
    label: "X/Twitter Post (1200×675)",
    width: 1200,
    height: 675,
    category: "social",
    platform: "x",
    starting_scale_small: autoScaleSmall(1200, 675),
    starting_scale_medium: autoScaleMedium(1200, 675),
    starting_scale_large: autoScaleLarge(1200, 675),
    orientation: toOrientation(1200, 675),
    aspect_ratio: toAspect(1200, 675),
    tags: ["post", "landscape"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "x-header-1500x500",
    label: "X/Twitter Header (1500×500)",
    width: 1500,
    height: 500,
    category: "branding",
    platform: "x",
    starting_scale_small: autoScaleSmall(1500, 500),
    starting_scale_medium: autoScaleMedium(1500, 500),
    starting_scale_large: autoScaleLarge(1500, 500),
    orientation: toOrientation(1500, 500),
    aspect_ratio: toAspect(1500, 500),
    tags: ["header", "banner"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "x-avatar-400x400",
    label: "X/Twitter Profile (400×400)",
    width: 400,
    height: 400,
    category: "branding",
    platform: "x",
    starting_scale_small: autoScaleSmall(400, 400),
    starting_scale_medium: autoScaleMedium(400, 400),
    starting_scale_large: autoScaleLarge(400, 400),
    orientation: "square",
    aspect_ratio: "1:1",
    tags: ["avatar", "profile"],
    recommended_export: ["JPG", "PNG"],
  },

  /* ————— Social: LinkedIn ————— */

  {
    id: "li-post-1200x1350",
    label: "LinkedIn Post — Portrait (1200×1350)",
    width: 1200,
    height: 1350,
    category: "social",
    platform: "linkedin",
    starting_scale_small: autoScaleSmall(1200, 1350),
    starting_scale_medium: autoScaleMedium(1200, 1350),
    starting_scale_large: autoScaleLarge(1200, 1350),
    orientation: toOrientation(1200, 1350),
    aspect_ratio: toAspect(1200, 1350),
    tags: ["post", "portrait"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "li-linkshare-1200x627",
    label: "LinkedIn Link Share (1200×627)",
    width: 1200,
    height: 627,
    category: "social",
    platform: "linkedin",
    starting_scale_small: autoScaleSmall(1200, 627),
    starting_scale_medium: autoScaleMedium(1200, 627),
    starting_scale_large: autoScaleLarge(1200, 627),
    orientation: toOrientation(1200, 627),
    aspect_ratio: toAspect(1200, 627),
    tags: ["link-share", "landscape"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "li-cover-personal-1584x396",
    label: "LinkedIn Cover — Personal (1584×396)",
    width: 1584,
    height: 396,
    category: "branding",
    platform: "linkedin",
    starting_scale_small: autoScaleSmall(1584, 396),
    starting_scale_medium: autoScaleMedium(1584, 396),
    starting_scale_large: autoScaleLarge(1584, 396),
    orientation: toOrientation(1584, 396),
    aspect_ratio: toAspect(1584, 396),
    tags: ["cover", "banner"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "li-cover-company-1128x191",
    label: "LinkedIn Cover — Company (1128×191)",
    width: 1128,
    height: 191,
    category: "branding",
    platform: "linkedin",
    starting_scale_small: autoScaleSmall(1128, 191),
    starting_scale_medium: autoScaleMedium(1128, 191),
    starting_scale_large: autoScaleLarge(1128, 191),
    orientation: toOrientation(1128, 191),
    aspect_ratio: toAspect(1128, 191),
    tags: ["cover", "banner"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "li-logo-300x300",
    label: "LinkedIn Company Logo (300×300)",
    width: 300,
    height: 300,
    category: "branding",
    platform: "linkedin",
    starting_scale_small: autoScaleSmall(300, 300),
    starting_scale_medium: autoScaleMedium(300, 300),
    starting_scale_large: autoScaleLarge(300, 300),
    orientation: "square",
    aspect_ratio: "1:1",
    tags: ["logo", "avatar"],
    recommended_export: ["PNG"],
  },

  /* ————— Social: YouTube ————— */

  {
    id: "yt-thumb-1280x720",
    label: "YouTube Thumbnail (1280×720)",
    width: 1280,
    height: 720,
    category: "social",
    platform: "youtube",
    popularity: 90,
    starting_scale_small: autoScaleSmall(1280, 720),
    starting_scale_medium: autoScaleMedium(1280, 720),
    starting_scale_large: autoScaleLarge(1280, 720),
    orientation: toOrientation(1280, 720),
    aspect_ratio: toAspect(1280, 720),
    tags: ["thumbnail", "video"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "yt-channel-2560x1440",
    label: "YouTube Channel Art (2560×1440)",
    width: 2560,
    height: 1440,
    category: "branding",
    platform: "youtube",
    starting_scale_small: autoScaleSmall(2560, 1440),
    starting_scale_medium: autoScaleMedium(2560, 1440),
    starting_scale_large: autoScaleLarge(2560, 1440),
    orientation: toOrientation(2560, 1440),
    aspect_ratio: toAspect(2560, 1440),
    tags: ["banner", "channel-art"],
    recommended_export: ["PNG", "JPG"],
  },
  // Bonus: Shorts explicit
  {
    id: "yt-shorts-1080x1920",
    label: "YouTube Shorts (1080×1920)",
    width: 1080,
    height: 1920,
    category: "social",
    platform: "youtube",
    starting_scale_small: autoScaleSmall(1080, 1920),
    starting_scale_medium: autoScaleMedium(1080, 1920),
    starting_scale_large: autoScaleLarge(1080, 1920),
    orientation: toOrientation(1080, 1920),
    aspect_ratio: toAspect(1080, 1920),
    tags: ["shorts", "vertical"],
    recommended_export: ["JPG", "PNG"],
  },

  /* ————— Social: TikTok ————— */

  {
    id: "tt-video-cover-1080x1920",
    label: "TikTok Video / Cover (1080×1920)",
    width: 1080,
    height: 1920,
    category: "social",
    platform: "tiktok",
    starting_scale_small: autoScaleSmall(1080, 1920),
    starting_scale_medium: autoScaleMedium(1080, 1920),
    starting_scale_large: autoScaleLarge(1080, 1920),
    orientation: toOrientation(1080, 1920),
    aspect_ratio: toAspect(1080, 1920),
    tags: ["cover", "vertical"],
    recommended_export: ["JPG", "PNG"],
  },

  /* ————— Social: Pinterest ————— */

  {
    id: "pin-standard-1000x1500",
    label: "Pinterest Pin — Standard (1000×1500)",
    width: 1000,
    height: 1500,
    category: "social",
    platform: "pinterest",
    starting_scale_small: autoScaleSmall(1000, 1500),
    starting_scale_medium: autoScaleMedium(1000, 1500),
    starting_scale_large: autoScaleLarge(1000, 1500),
    orientation: toOrientation(1000, 1500),
    aspect_ratio: toAspect(1000, 1500),
    tags: ["pin", "portrait"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "pin-square-1000x1000",
    label: "Pinterest Pin — Square (1000×1000)",
    width: 1000,
    height: 1000,
    category: "social",
    platform: "pinterest",
    starting_scale_small: autoScaleSmall(1000, 1000),
    starting_scale_medium: autoScaleMedium(1000, 1000),
    starting_scale_large: autoScaleLarge(1000, 1000),
    orientation: "square",
    aspect_ratio: "1:1",
    tags: ["pin", "square"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "pin-long-1000x2100",
    label: "Pinterest Pin — Long (1000×2100)",
    width: 1000,
    height: 2100,
    category: "social",
    platform: "pinterest",
    starting_scale_small: autoScaleSmall(1000, 2100),
    starting_scale_medium: autoScaleMedium(1000, 2100),
    starting_scale_large: autoScaleLarge(1000, 2100),
    orientation: toOrientation(1000, 2100),
    aspect_ratio: toAspect(1000, 2100),
    tags: ["pin", "long", "vertical"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "threads-post-1080x1350",
    label: "Threads Post (1080×1350)",
    width: 1080,
    height: 1350,
    category: "social",
    platform: "instagram",
    tags: ["portrait"],
    starting_scale_small: autoScaleSmall(1080, 1350),
    starting_scale_medium: autoScaleMedium(1080, 1350),
    starting_scale_large: autoScaleLarge(1080, 1350),
    orientation: toOrientation(1080, 1350),
    aspect_ratio: toAspect(1080, 1350),
    recommended_export: ["JPG", "PNG"],
  },

  {
    id: "snap-spotlight-1080x1920",
    label: "Snapchat Spotlight/Story (1080×1920)",
    width: 1080,
    height: 1920,
    category: "social",
    tags: ["story", "vertical"],
    starting_scale_small: autoScaleSmall(1080, 1920),
    starting_scale_medium: autoScaleMedium(1080, 1920),
    starting_scale_large: autoScaleLarge(1080, 1920),
    orientation: toOrientation(1080, 1920),
    aspect_ratio: toAspect(1080, 1920),
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "twitch-panel-320x100",
    label: "Twitch Panel (320×100)",
    width: 320,
    height: 100,
    category: "streaming",
    platform: "twitch",
    tags: ["panel", "ui"],
    starting_scale_small: autoScaleSmall(320, 100),
    starting_scale_medium: autoScaleMedium(320, 100),
    starting_scale_large: autoScaleLarge(320, 100),
    orientation: toOrientation(320, 100),
    aspect_ratio: toAspect(320, 100),
    recommended_export: ["PNG", "JPG"],
  },

  /* ————— Product: Amazon / Etsy / Shopify ————— */

  {
    id: "merch-tshirt-4500x5400",
    label: "Merch T-Shirt Print (4500×5400)",
    width: 4500,
    height: 5400,
    category: "product",
    tags: ["merch", "shirt", "print"],
    starting_scale_small: autoScaleSmall(4500, 5400),
    starting_scale_medium: autoScaleMedium(4500, 5400),
    starting_scale_large: autoScaleLarge(4500, 5400),
    orientation: toOrientation(4500, 5400),
    aspect_ratio: toAspect(4500, 5400),
    recommended_export: ["PNG"],
  },

  {
    id: "shopify-collection-1024",
    label: "Shopify Collection Image (1024×1024)",
    width: 1024,
    height: 1024,
    category: "product",
    platform: "shopify",
    tags: ["collection", "square"],
    starting_scale_small: autoScaleSmall(1024, 1024),
    starting_scale_medium: autoScaleMedium(1024, 1024),
    starting_scale_large: autoScaleLarge(1024, 1024),
    orientation: "square",
    aspect_ratio: "1:1",
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "amz-product-2000x2000",
    label: "Amazon Product — Square (2000×2000)",
    width: 2000,
    height: 2000,
    category: "product",
    platform: "amazon",
    starting_scale_small: autoScaleSmall(2000, 2000),
    starting_scale_medium: autoScaleMedium(2000, 2000),
    starting_scale_large: autoScaleLarge(2000, 2000),
    orientation: "square",
    aspect_ratio: "1:1",
    tags: ["product", "square", "zoom"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "amz-product-2560x2560",
    label: "Amazon Product — Square (2560×2560)",
    width: 2560,
    height: 2560,
    category: "product",
    platform: "amazon",
    starting_scale_small: autoScaleSmall(2560, 2560),
    starting_scale_medium: autoScaleMedium(2560, 2560),
    starting_scale_large: autoScaleLarge(2560, 2560),
    orientation: "square",
    aspect_ratio: "1:1",
    tags: ["product", "square", "zoom", "hires"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "amz-product-portrait-2000x2500",
    label: "Amazon Product — Portrait (2000×2500)",
    width: 2000,
    height: 2500,
    category: "product",
    platform: "amazon",
    starting_scale_small: autoScaleSmall(2000, 2500),
    starting_scale_medium: autoScaleMedium(2000, 2500),
    starting_scale_large: autoScaleLarge(2000, 2500),
    orientation: toOrientation(2000, 2500),
    aspect_ratio: toAspect(2000, 2500),
    tags: ["product", "portrait", "gallery"],
    recommended_export: ["JPG", "PNG"],
  },

  // A+ Content (common modules)
  {
    id: "amz-a-plus-standard-970x300",
    label: "Amazon A+ — Standard Banner (970×300)",
    width: 970,
    height: 300,
    category: "product",
    platform: "amazon",
    starting_scale_small: autoScaleSmall(970, 300),
    starting_scale_medium: autoScaleMedium(970, 300),
    starting_scale_large: autoScaleLarge(970, 300),
    orientation: toOrientation(970, 300),
    aspect_ratio: toAspect(970, 300),
    tags: ["a+", "banner"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "amz-a-plus-premium-1464x600",
    label: "Amazon A+ — Premium Full Image (1464×600)",
    width: 1464,
    height: 600,
    category: "product",
    platform: "amazon",
    starting_scale_small: autoScaleSmall(1464, 600),
    starting_scale_medium: autoScaleMedium(1464, 600),
    starting_scale_large: autoScaleLarge(1464, 600),
    orientation: toOrientation(1464, 600),
    aspect_ratio: toAspect(1464, 600),
    tags: ["a+", "banner", "premium"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "amz-brand-story-1464x625",
    label: "Amazon Brand Story — Background (1464×625)",
    width: 1464,
    height: 625,
    category: "product",
    platform: "amazon",
    starting_scale_small: autoScaleSmall(1464, 625),
    starting_scale_medium: autoScaleMedium(1464, 625),
    starting_scale_large: autoScaleLarge(1464, 625),
    orientation: toOrientation(1464, 625),
    aspect_ratio: toAspect(1464, 625),
    tags: ["brand-story", "background"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "amz-brand-story-mobile-463x625",
    label: "Amazon Brand Story — Mobile (463×625)",
    width: 463,
    height: 625,
    category: "product",
    platform: "amazon",
    starting_scale_small: autoScaleSmall(463, 625),
    starting_scale_medium: autoScaleMedium(463, 625),
    starting_scale_large: autoScaleLarge(463, 625),
    orientation: toOrientation(463, 625),
    aspect_ratio: toAspect(463, 625),
    tags: ["brand-story", "mobile"],
    recommended_export: ["JPG", "PNG"],
  },
  // Storefront
  {
    id: "amz-store-hero-3000x600",
    label: "Amazon Storefront — Hero (3000×600)",
    width: 3000,
    height: 600,
    category: "branding",
    platform: "amazon",
    starting_scale_small: autoScaleSmall(3000, 600),
    starting_scale_medium: autoScaleMedium(3000, 600),
    starting_scale_large: autoScaleLarge(3000, 600),
    orientation: toOrientation(3000, 600),
    aspect_ratio: toAspect(3000, 600),
    tags: ["storefront", "hero", "banner"],
    recommended_export: ["PNG", "JPG"],
  },
  {
    id: "amz-store-logo-400x400",
    label: "Amazon Storefront — Logo (400×400)",
    width: 400,
    height: 400,
    category: "branding",
    platform: "amazon",
    starting_scale_small: autoScaleSmall(400, 400),
    starting_scale_medium: autoScaleMedium(400, 400),
    starting_scale_large: autoScaleLarge(400, 400),
    orientation: "square",
    aspect_ratio: "1:1",
    tags: ["storefront", "logo", "avatar"],
    recommended_export: ["PNG"],
  },

  // Etsy / Shopify
  {
    id: "etsy-listing-2000x2000",
    label: "Etsy Listing — Square (2000×2000)",
    width: 2000,
    height: 2000,
    category: "product",
    platform: "etsy",
    starting_scale_small: autoScaleSmall(2000, 2000),
    starting_scale_medium: autoScaleMedium(2000, 2000),
    starting_scale_large: autoScaleLarge(2000, 2000),
    orientation: "square",
    aspect_ratio: "1:1",
    tags: ["listing", "square"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "shopify-product-2048x2048",
    label: "Shopify Product — Square (2048×2048)",
    width: 2048,
    height: 2048,
    category: "product",
    platform: "shopify",
    starting_scale_small: autoScaleSmall(2048, 2048),
    starting_scale_medium: autoScaleMedium(2048, 2048),
    starting_scale_large: autoScaleLarge(2048, 2048),
    orientation: "square",
    aspect_ratio: "1:1",
    tags: ["product", "square"],
    recommended_export: ["JPG", "PNG"],
  },

  /* ————— Ads: Google Display Network ————— */

  {
    id: "gads-300x250",
    label: "Google Ad — Medium Rectangle (300×250)",
    width: 300,
    height: 250,
    category: "ads",
    platform: "google",
    starting_scale_small: autoScaleSmall(300, 250),
    starting_scale_medium: autoScaleMedium(300, 250),
    starting_scale_large: autoScaleLarge(300, 250),
    orientation: toOrientation(300, 250),
    aspect_ratio: toAspect(300, 250),
    tags: ["responsive", "image"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "gads-336x280",
    label: "Google Ad — Large Rectangle (336×280)",
    width: 336,
    height: 280,
    category: "ads",
    platform: "google",
    starting_scale_small: autoScaleSmall(336, 280),
    starting_scale_medium: autoScaleMedium(336, 280),
    starting_scale_large: autoScaleLarge(336, 280),
    orientation: toOrientation(336, 280),
    aspect_ratio: toAspect(336, 280),
    tags: ["responsive", "image"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "gads-728x90",
    label: "Google Ad — Leaderboard (728×90)",
    width: 728,
    height: 90,
    category: "ads",
    platform: "google",
    starting_scale_small: autoScaleSmall(728, 90),
    starting_scale_medium: autoScaleMedium(728, 90),
    starting_scale_large: autoScaleLarge(728, 90),
    orientation: toOrientation(728, 90),
    aspect_ratio: toAspect(728, 90),
    tags: ["responsive", "image", "banner"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "gads-970x250",
    label: "Google Ad — Billboard (970×250)",
    width: 970,
    height: 250,
    category: "ads",
    platform: "google",
    starting_scale_small: autoScaleSmall(970, 250),
    starting_scale_medium: autoScaleMedium(970, 250),
    starting_scale_large: autoScaleLarge(970, 250),
    orientation: toOrientation(970, 250),
    aspect_ratio: toAspect(970, 250),
    tags: ["responsive", "image", "banner"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "gads-300x600",
    label: "Google Ad — Half Page (300×600)",
    width: 300,
    height: 600,
    category: "ads",
    platform: "google",
    starting_scale_small: autoScaleSmall(300, 600),
    starting_scale_medium: autoScaleMedium(300, 600),
    starting_scale_large: autoScaleLarge(300, 600),
    orientation: toOrientation(300, 600),
    aspect_ratio: toAspect(300, 600),
    tags: ["responsive", "image"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "gads-160x600",
    label: "Google Ad — Wide Skyscraper (160×600)",
    width: 160,
    height: 600,
    category: "ads",
    platform: "google",
    starting_scale_small: autoScaleSmall(160, 600),
    starting_scale_medium: autoScaleMedium(160, 600),
    starting_scale_large: autoScaleLarge(160, 600),
    orientation: toOrientation(160, 600),
    aspect_ratio: toAspect(160, 600),
    tags: ["responsive", "image"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "gads-320x100",
    label: "Google Ad — Large Mobile Banner (320×100)",
    width: 320,
    height: 100,
    category: "ads",
    platform: "google",
    starting_scale_small: autoScaleSmall(320, 100),
    starting_scale_medium: autoScaleMedium(320, 100),
    starting_scale_large: autoScaleLarge(320, 100),
    orientation: toOrientation(320, 100),
    aspect_ratio: toAspect(320, 100),
    tags: ["responsive", "image", "mobile"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "gads-468x60",
    label: "Google Ad — Banner (468×60)",
    width: 468,
    height: 60,
    category: "ads",
    platform: "google",
    starting_scale_small: autoScaleSmall(468, 60),
    starting_scale_medium: autoScaleMedium(468, 60),
    starting_scale_large: autoScaleLarge(468, 60),
    orientation: toOrientation(468, 60),
    aspect_ratio: toAspect(468, 60),
    tags: ["responsive", "image", "banner"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "gads-250x250",
    label: "Google Ad — Square (250×250)",
    width: 250,
    height: 250,
    category: "ads",
    platform: "google",
    starting_scale_small: autoScaleSmall(250, 250),
    starting_scale_medium: autoScaleMedium(250, 250),
    starting_scale_large: autoScaleLarge(250, 250),
    orientation: "square",
    aspect_ratio: "1:1",
    tags: ["responsive", "image", "square"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "gads-200x200",
    label: "Google Ad — Small Square (200×200)",
    width: 200,
    height: 200,
    category: "ads",
    platform: "google",
    starting_scale_small: autoScaleSmall(200, 200),
    starting_scale_medium: autoScaleMedium(200, 200),
    starting_scale_large: autoScaleLarge(200, 200),
    orientation: "square",
    aspect_ratio: "1:1",
    tags: ["responsive", "image", "square"],
    recommended_export: ["JPG", "PNG"],
  },

  // Extras to feel "complete"
  {
    id: "gads-970x90",
    label: "Google Ad — Large Leaderboard (970×90)",
    width: 970,
    height: 90,
    category: "ads",
    platform: "google",
    starting_scale_small: autoScaleSmall(970, 90),
    starting_scale_medium: autoScaleMedium(970, 90),
    starting_scale_large: autoScaleLarge(970, 90),
    orientation: toOrientation(970, 90),
    aspect_ratio: toAspect(970, 90),
    tags: ["responsive", "image", "banner"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "gads-120x600",
    label: "Google Ad — Skyscraper (120×600)",
    width: 120,
    height: 600,
    category: "ads",
    platform: "google",
    starting_scale_small: autoScaleSmall(120, 600),
    starting_scale_medium: autoScaleMedium(120, 600),
    starting_scale_large: autoScaleLarge(120, 600),
    orientation: toOrientation(120, 600),
    aspect_ratio: toAspect(120, 600),
    tags: ["responsive", "image"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "gads-240x400",
    label: "Google Ad — Vertical Rectangle (240×400)",
    width: 240,
    height: 400,
    category: "ads",
    platform: "google",
    starting_scale_small: autoScaleSmall(240, 400),
    starting_scale_medium: autoScaleMedium(240, 400),
    starting_scale_large: autoScaleLarge(240, 400),
    orientation: toOrientation(240, 400),
    aspect_ratio: toAspect(240, 400),
    tags: ["responsive", "image"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "gads-980x120",
    label: "Google Ad — Panorama (980×120)",
    width: 980,
    height: 120,
    category: "ads",
    platform: "google",
    starting_scale_small: autoScaleSmall(980, 120),
    starting_scale_medium: autoScaleMedium(980, 120),
    starting_scale_large: autoScaleLarge(980, 120),
    orientation: toOrientation(980, 120),
    aspect_ratio: toAspect(980, 120),
    tags: ["responsive", "image", "banner"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "gads-320x50",
    label: "Google Ad — Mobile Banner (320×50)",
    width: 320,
    height: 50,
    category: "ads",
    platform: "google",
    starting_scale_small: autoScaleSmall(320, 50),
    starting_scale_medium: autoScaleMedium(320, 50),
    starting_scale_large: autoScaleLarge(320, 50),
    orientation: toOrientation(320, 50),
    aspect_ratio: toAspect(320, 50),
    tags: ["responsive", "image", "mobile", "banner"],
    recommended_export: ["JPG", "PNG"],
  },

  /* ————— Comics (print) ————— */

  {
    id: "comic-us-single-bleed-2063x3150",
    label: "Comic — US Single Page (with bleed) 2063×3150",
    width: 2063,
    height: 3150,
    dpi: 300,
    category: "comic",
    starting_scale_small: autoScaleSmall(2063, 3150),
    starting_scale_medium: autoScaleMedium(2063, 3150),
    starting_scale_large: autoScaleLarge(2063, 3150),
    orientation: toOrientation(2063, 3150),
    aspect_ratio: toAspect(2063, 3150),
    printable: true,
    unit: "in",
    print: {
      unit: "in",
      trim_w: 6.625,
      trim_h: 10.25,
      bleed_all: 0.125,
      safe_margin: 0.25,
    },
    tags: ["print", "bleed", "trim", "panel"],
    recommended_export: ["TIFF", "PNG", "PDF"],
    color_profile: "CMYK-ish",
  },
  {
    id: "comic-us-spread-bleed-4050x3150",
    label: "Comic — Double-Page Spread (with bleed) 4050×3150",
    width: 4050,
    height: 3150,
    dpi: 300,
    category: "comic",
    starting_scale_small: autoScaleSmall(4050, 3150),
    starting_scale_medium: autoScaleMedium(4050, 3150),
    starting_scale_large: autoScaleLarge(4050, 3150),
    orientation: toOrientation(4050, 3150),
    aspect_ratio: toAspect(4050, 3150),
    printable: true,
    unit: "in",
    print: {
      unit: "in",
      trim_w: 13.25,
      trim_h: 10.25,
      bleed_all: 0.125,
      safe_margin: 0.25,
    },
    tags: ["print", "bleed", "spread"],
    recommended_export: ["TIFF", "PNG", "PDF"],
    color_profile: "CMYK-ish",
  },

  /* ————— Webtoon / Vertical Scroll ————— */

  {
    id: "webtoon-slice-800x1280",
    label: "Webtoon Slice (800×1280)",
    width: 800,
    height: 1280,
    category: "webtoon",
    starting_scale_small: autoScaleSmall(800, 1280),
    starting_scale_medium: autoScaleMedium(800, 1280),
    starting_scale_large: autoScaleLarge(800, 1280),
    orientation: toOrientation(800, 1280),
    aspect_ratio: toAspect(800, 1280),
    tags: ["episode", "slice", "vertical"],
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "webtoon-slice-2x-1600x2560",
    label: "Webtoon Slice (Hi-Res 2×) 1600×2560",
    width: 1600,
    height: 2560,
    category: "webtoon",
    starting_scale_small: autoScaleSmall(1600, 2560),
    starting_scale_medium: autoScaleMedium(1600, 2560),
    starting_scale_large: autoScaleLarge(1600, 2560),
    orientation: toOrientation(1600, 2560),
    aspect_ratio: toAspect(1600, 2560),
    tags: ["episode", "slice", "vertical", "hires", "downscale"],
    recommended_export: ["JPG", "PNG"],
  },

  /* ————— Streaming (Twitch quick hits) ————— */

  {
    id: "twitch-profile-800x800",
    label: "Twitch Profile (800×800)",
    width: 800,
    height: 800,
    category: "streaming",
    platform: "twitch",
    starting_scale_small: autoScaleSmall(800, 800),
    starting_scale_medium: autoScaleMedium(800, 800),
    starting_scale_large: autoScaleLarge(800, 800),
    orientation: "square",
    aspect_ratio: "1:1",
    tags: ["avatar", "profile"],
    recommended_export: ["PNG", "JPG"],
  },
  {
    id: "twitch-banner-1200x480",
    label: "Twitch Banner (1200×480)",
    width: 1200,
    height: 480,
    category: "streaming",
    platform: "twitch",
    starting_scale_small: autoScaleSmall(1200, 480),
    starting_scale_medium: autoScaleMedium(1200, 480),
    starting_scale_large: autoScaleLarge(1200, 480),
    orientation: toOrientation(1200, 480),
    aspect_ratio: toAspect(1200, 480),
    tags: ["banner", "header"],
    recommended_export: ["PNG", "JPG"],
  },

  /* ————— Documents (Letter/A4, posters, resumes) ————— */

  {
    id: "doc-letter-2550x3300",
    label: "Document — US Letter (8.5×11in @300dpi) 2550×3300",
    width: 2550,
    height: 3300,
    dpi: 300,
    category: "document",
    starting_scale_small: autoScaleSmall(2550, 3300),
    starting_scale_medium: autoScaleMedium(2550, 3300),
    starting_scale_large: autoScaleLarge(2550, 3300),
    orientation: toOrientation(2550, 3300),
    aspect_ratio: toAspect(2550, 3300),
    printable: true,
    unit: "in",
    print: {
      unit: "in",
      trim_w: 8.5,
      trim_h: 11,
      bleed_all: 0.125,
      safe_margin: 0.25,
    },
    tags: ["print", "document", "poster"],
    color_profile: "CMYK-ish",
    recommended_export: ["PDF", "TIFF", "PNG"],
  },
  {
    id: "doc-a4-2480x3508",
    label: "Document — A4 (210×297mm @300dpi) 2480×3508",
    width: 2480,
    height: 3508,
    dpi: 300,
    category: "document",
    starting_scale_small: autoScaleSmall(2480, 3508),
    starting_scale_medium: autoScaleMedium(2480, 3508),
    starting_scale_large: autoScaleLarge(2480, 3508),
    orientation: toOrientation(2480, 3508),
    aspect_ratio: toAspect(2480, 3508),
    printable: true,
    unit: "mm",
    print: {
      unit: "mm",
      trim_w: 210,
      trim_h: 297,
      bleed_all: 3,
      safe_margin: 6,
    },
    tags: ["print", "document"],
    color_profile: "CMYK-ish",
    recommended_export: ["PDF", "TIFF", "PNG"],
  },
  {
    id: "bizcard-us-bleed-1125x675",
    label: "Business Card US (3.5×2in + 0.125in bleed) 1125×675",
    width: 1125,
    height: 675,
    dpi: 300,
    category: "document",
    printable: true,
    unit: "in",
    print: {
      unit: "in",
      trim_w: 3.5,
      trim_h: 2,
      bleed_all: 0.125,
      safe_margin: 0.125,
    },
    tags: ["print", "business-card"],
    starting_scale_small: autoScaleSmall(1125, 675),
    starting_scale_medium: autoScaleMedium(1125, 675),
    starting_scale_large: autoScaleLarge(1125, 675),
    orientation: toOrientation(1125, 675),
    aspect_ratio: toAspect(1125, 675),
    color_profile: "CMYK-ish",
    recommended_export: ["PDF", "TIFF", "PNG"],
  },
  {
    id: "postcard-5x7-bleed-1575x2175",
    label: "Postcard (5×7in + 0.125in bleed) 1575×2175",
    width: 1575,
    height: 2175,
    dpi: 300,
    category: "document",
    printable: true,
    unit: "in",
    print: {
      unit: "in",
      trim_w: 5,
      trim_h: 7,
      bleed_all: 0.125,
      safe_margin: 0.25,
    },
    tags: ["print", "postcard"],
    starting_scale_small: autoScaleSmall(1575, 2175),
    starting_scale_medium: autoScaleMedium(1575, 2175),
    starting_scale_large: autoScaleLarge(1575, 2175),
    orientation: toOrientation(1575, 2175),
    aspect_ratio: toAspect(1575, 2175),
    color_profile: "CMYK-ish",
    recommended_export: ["PDF", "TIFF", "PNG"],
  },
  {
    id: "poster-24x36-300dpi-7200x10800",
    label: "Poster (24×36in @300dpi) 7200×10800",
    width: 7200,
    height: 10800,
    dpi: 300,
    category: "document",
    printable: true,
    unit: "in",
    print: {
      unit: "in",
      trim_w: 24,
      trim_h: 36,
      bleed_all: 0.125,
      safe_margin: 0.25,
    },
    tags: ["print", "poster", "large-format"],
    starting_scale_small: autoScaleSmall(7200, 10800),
    starting_scale_medium: autoScaleMedium(7200, 10800),
    starting_scale_large: autoScaleLarge(7200, 10800),
    orientation: toOrientation(7200, 10800),
    aspect_ratio: toAspect(7200, 10800),
    color_profile: "CMYK-ish",
    recommended_export: ["PDF", "TIFF", "PNG"],
  },

  /* ————— Presentation (PowerPoint/Keynote/Slides) ————— */

  {
    id: "ppt-1920x1080",
    label: "Presentation — 16:9 (1920×1080)",
    width: 1920,
    height: 1080,
    category: "presentation",
    platform: "powerpoint",
    starting_scale_small: autoScaleSmall(1920, 1080),
    starting_scale_medium: autoScaleMedium(1920, 1080),
    starting_scale_large: autoScaleLarge(1920, 1080),
    orientation: toOrientation(1920, 1080),
    aspect_ratio: toAspect(1920, 1080),
    tags: ["slide", "widescreen", "16:9"],
    recommended_export: ["PNG", "JPG", "PDF"],
  },
  {
    id: "ppt-1280x720",
    label: "Presentation — 16:9 (1280×720)",
    width: 1280,
    height: 720,
    category: "presentation",
    platform: "powerpoint",
    starting_scale_small: autoScaleSmall(1280, 720),
    starting_scale_medium: autoScaleMedium(1280, 720),
    starting_scale_large: autoScaleLarge(1280, 720),
    orientation: toOrientation(1280, 720),
    aspect_ratio: toAspect(1280, 720),
    tags: ["slide", "widescreen", "16:9"],
    recommended_export: ["PNG", "JPG", "PDF"],
  },
  {
    id: "ppt-1024x768",
    label: "Presentation — 4:3 (1024×768)",
    width: 1024,
    height: 768,
    category: "presentation",
    platform: "powerpoint",
    starting_scale_small: autoScaleSmall(1024, 768),
    starting_scale_medium: autoScaleMedium(1024, 768),
    starting_scale_large: autoScaleLarge(1024, 768),
    orientation: toOrientation(1024, 768),
    aspect_ratio: toAspect(1024, 768),
    tags: ["slide", "classic", "4:3"],
    recommended_export: ["PNG", "JPG", "PDF"],
  },

  /* ———————————————————— App / Store ———————————————————— */

  {
    id: "app-icon-1024",
    label: "App Icon (1024×1024)",
    width: 1024,
    height: 1024,
    category: "app",
    platform: "none",
    starting_scale_small: autoScaleSmall(1024, 1024),
    starting_scale_medium: autoScaleMedium(1024, 1024),
    starting_scale_large: autoScaleLarge(1024, 1024),
    orientation: "square",
    aspect_ratio: "1:1",
    tags: ["icon", "store"],
    recommended_export: ["PNG"],
  },
  {
    id: "play-feature-1024x500",
    label: "Google Play Feature Graphic (1024×500)",
    width: 1024,
    height: 500,
    category: "app",
    tags: ["feature-graphic"],
    starting_scale_small: autoScaleSmall(1024, 500),
    starting_scale_medium: autoScaleMedium(1024, 500),
    starting_scale_large: autoScaleLarge(1024, 500),
    orientation: toOrientation(1024, 500),
    aspect_ratio: toAspect(1024, 500),
    recommended_export: ["PNG", "JPG"],
  },
  {
    id: "ios-shot-1242x2688",
    label: "iOS Screenshot (1242×2688)",
    width: 1242,
    height: 2688,
    category: "app",
    tags: ["screenshot", "portrait"],
    starting_scale_small: autoScaleSmall(1242, 2688),
    starting_scale_medium: autoScaleMedium(1242, 2688),
    starting_scale_large: autoScaleLarge(1242, 2688),
    orientation: toOrientation(1242, 2688),
    aspect_ratio: toAspect(1242, 2688),
    recommended_export: ["PNG", "JPG"],
  },

  /* ———————————————————— Icon / Avatar / QR ———————————————————— */

  {
    id: "favicon-512",
    label: "Favicon / PWA (512×512)",
    width: 512,
    height: 512,
    category: "icon",
    tags: ["favicon", "pwa", "icon"],
    starting_scale_small: autoScaleSmall(512, 512),
    starting_scale_medium: autoScaleMedium(512, 512),
    starting_scale_large: autoScaleLarge(512, 512),
    orientation: "square",
    aspect_ratio: "1:1",
    recommended_export: ["PNG"],
  },
  {
    id: "avatar-800",
    label: "Universal Avatar (800×800)",
    width: 800,
    height: 800,
    category: "icon",
    tags: ["avatar", "profile"],
    starting_scale_small: autoScaleSmall(800, 800),
    starting_scale_medium: autoScaleMedium(800, 800),
    starting_scale_large: autoScaleLarge(800, 800),
    orientation: "square",
    aspect_ratio: "1:1",
    recommended_export: ["PNG", "JPG"],
  },
  {
    id: "qr-1024",
    label: "QR Code Canvas (1024×1024)",
    width: 1024,
    height: 1024,
    category: "icon",
    tags: ["qr", "square"],
    starting_scale_small: autoScaleSmall(1024, 1024),
    starting_scale_medium: autoScaleMedium(1024, 1024),
    starting_scale_large: autoScaleLarge(1024, 1024),
    orientation: "square",
    aspect_ratio: "1:1",
    recommended_export: ["PNG", "SVG", "PDF"],
  },

  /* ———————————————————— Email ———————————————————— */

  {
    id: "email-hero-1200x600",
    label: "Email Hero (1200×600)",
    width: 1200,
    height: 600,
    category: "email",
    tags: ["hero", "banner", "newsletter"],
    starting_scale_small: autoScaleSmall(1200, 600),
    starting_scale_medium: autoScaleMedium(1200, 600),
    starting_scale_large: autoScaleLarge(1200, 600),
    orientation: toOrientation(1200, 600),
    aspect_ratio: toAspect(1200, 600),
    recommended_export: ["JPG", "PNG"],
  },
  {
    id: "email-module-600x600",
    label: "Email Module (600×600)",
    width: 600,
    height: 600,
    category: "email",
    tags: ["module", "square"],
    starting_scale_small: autoScaleSmall(600, 600),
    starting_scale_medium: autoScaleMedium(600, 600),
    starting_scale_large: autoScaleLarge(600, 600),
    orientation: "square",
    aspect_ratio: "1:1",
    recommended_export: ["JPG", "PNG"],
  },

  /* ———————————————————— Wallpaper ———————————————————— */

  {
    id: "wallpaper-iphone-1290x2796",
    label: "iPhone Wallpaper (1290×2796)",
    width: 1290,
    height: 2796,
    category: "wallpaper",
    tags: ["phone", "vertical"],
    starting_scale_small: autoScaleSmall(1290, 2796),
    starting_scale_medium: autoScaleMedium(1290, 2796),
    starting_scale_large: autoScaleLarge(1290, 2796),
    orientation: toOrientation(1290, 2796),
    aspect_ratio: toAspect(1290, 2796),
    recommended_export: ["PNG", "JPG"],
  },

  {
    id: "wallpaper-android-1440x3200",
    label: "Android Wallpaper (1440×3200)",
    width: 1440,
    height: 3200,
    category: "wallpaper",
    tags: ["phone", "vertical"],
    starting_scale_small: autoScaleSmall(1440, 3200),
    starting_scale_medium: autoScaleMedium(1440, 3200),
    starting_scale_large: autoScaleLarge(1440, 3200),
    orientation: toOrientation(1440, 3200),
    aspect_ratio: toAspect(1440, 3200),
    recommended_export: ["PNG", "JPG"],
  },

  {
    id: "wallpaper-uhd-3840x2160",
    label: "Desktop Wallpaper UHD (3840×2160)",
    width: 3840,
    height: 2160,
    category: "wallpaper",
    tags: ["desktop", "16:9"],
    starting_scale_small: autoScaleSmall(3840, 2160),
    starting_scale_medium: autoScaleMedium(3840, 2160),
    starting_scale_large: autoScaleLarge(3840, 2160),
    orientation: toOrientation(3840, 2160),
    aspect_ratio: toAspect(3840, 2160),
    recommended_export: ["PNG", "JPG"],
  },
];

/* ============================
 * Default preset picker
 * ============================ */

// Default: start with a neutral “select a size” in the UI.
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
    comic: (p) => p.category === "comic",
    webtoon: (p) => p.category === "webtoon",
    streaming: (p) => p.category === "streaming",
    document: (p) => p.category === "document",
    presentation: (p) => p.category === "presentation",
  };
  const key = (projectType ?? "").toLowerCase();
  const predicate = map[key] ?? ((p) => p.category === "generic" || p.category === "social");
  const candidates = PRESETS
    .filter(predicate)
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
  return candidates[0] ?? PRESETS[0];
}
*/
