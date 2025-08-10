// // src/lib/project-utils.ts
// import type { Project } from "@/types/project";
// import type { ComponentType, ReactNode } from "react";
// import type { GeneratedAsset } from "@/types/generatedAsset";
// import {
//   BookOpen,
//   Music2,
//   Briefcase,
//   ImageIcon,
//   Star,
//   Megaphone,
// } from "lucide-react";
// import {
//   SiInstagram,
//   SiFacebook,
//   SiX,
//   SiLinkedin,
//   SiYoutube,
//   SiPinterest,
// } from "react-icons/si";
// import * as React from "react";

// // Channels
// export type ChannelKey =
//   | "Book"
//   | "Instagram"
//   | "Facebook"
//   | "X"
//   | "LinkedIn"
//   | "YouTube"
//   | "Pinterest"
//   | "Ads";

// // store **components**, not JSX elements
// export type IconComponent = ComponentType<{ className?: string }>;

// export const CHANNEL_ICON: Record<ChannelKey, IconComponent> = {
//   Book: BookOpen,
//   Instagram: SiInstagram,
//   Facebook: SiFacebook,
//   X: SiX,
//   LinkedIn: SiLinkedin,
//   YouTube: SiYoutube,
//   Pinterest: SiPinterest,
//   Ads: Star, // or any Megaphone icon you prefer from lucide (Megaphone works too)
// };

// // status → shadcn badge variant
// export function variantForStatus(
//   status?: string
// ): "pending" | "secondary" | "default" | "destructive" | "outline" {
//   const s = (status ?? "").toUpperCase();
//   if (s === "READY" || s === "ACTIVE") return "default";
//   if (s === "PENDING" || s === "PROCESSING") return "pending";
//   if (s === "FAILED") return "destructive";
//   return "outline";
// }

// export function typeAccentClasses(projectType?: string): string {
//   const t = (projectType ?? "").toLowerCase();
//   if (t.includes("book")) return "ring-2 ring-purple-300/60";
//   if (t.includes("band") || t.includes("music"))
//     return "ring-2 ring-rose-300/60";
//   if (t.includes("business") || t.includes("brand"))
//     return "ring-2 ring-sky-300/60";
//   return "ring-2 ring-muted/40";
// }

// // Return a **component reference**; consumer will render <Icon className="..." />
// export function iconForProjectType(projectType?: string): IconComponent {
//   const t = (projectType ?? "").toLowerCase();
//   if (t.includes("book")) return BookOpen;
//   if (t.includes("band") || t.includes("music")) return Music2;
//   if (t.includes("business") || t.includes("brand")) return Briefcase;
//   return ImageIcon;
// }

// // Channels inferred from assets
// export function inferChannels(assets?: GeneratedAsset[]): ChannelKey[] {
//   if (!assets) return [];
//   const names = new Set<ChannelKey>();
//   for (const asset of assets) {
//     const typeName = asset.asset_type?.name?.toLowerCase() ?? "";
//     if (!typeName) continue;
//     if (
//       typeName.includes("kdp") ||
//       typeName.includes("print") ||
//       typeName.includes("ebook") ||
//       typeName.includes("audible")
//     )
//       names.add("Book");
//     if (typeName.includes("instagram")) names.add("Instagram");
//     if (typeName.includes("facebook")) names.add("Facebook");
//     if (typeName.includes("twitter") || typeName.includes("x/")) names.add("X");
//     if (typeName.includes("linkedin")) names.add("LinkedIn");
//     if (typeName.includes("youtube")) names.add("YouTube");
//     if (typeName.includes("pinterest")) names.add("Pinterest");
//     if (
//       typeName.includes("ad") ||
//       typeName.includes("gdn") ||
//       typeName.includes("display")
//     )
//       names.add("Ads");
//   }
//   return Array.from(names);
// }

// export const UNIVERSAL_CHANNELS: ChannelKey[] = [
//   "Instagram",
//   "Facebook",
//   "X",
//   "LinkedIn",
//   "YouTube",
//   "Pinterest",
//   "Ads",
// ];

// export function baselineChannelsFor(project: Project): ChannelKey[] {
//   const t = (project.type ?? "").toLowerCase();
//   const list = [...UNIVERSAL_CHANNELS];
//   if (t.includes("book")) list.unshift("Book");
//   return list;
// }

// export function channelActive(assetTypeName: string, channel: ChannelKey) {
//   const t = assetTypeName.toLowerCase();
//   switch (channel) {
//     case "Book":
//       return (
//         t.includes("kdp") ||
//         t.includes("print") ||
//         t.includes("ebook") ||
//         t.includes("audible")
//       );
//     case "Instagram":
//       return t.includes("instagram");
//     case "Facebook":
//       return t.includes("facebook");
//     case "X":
//       return t.includes("twitter") || t.includes("x/");
//     case "LinkedIn":
//       return t.includes("linkedin");
//     case "YouTube":
//       return t.includes("youtube");
//     case "Pinterest":
//       return t.includes("pinterest");
//     case "Ads":
//       return t.includes("ad") || t.includes("gdn") || t.includes("display");
//   }
// }

// const PLACEHOLDER_SRC = "/books.jpg";

// export function getPreviewUrl(project: Project): {
//   url: string;
//   isPlaceholder: boolean;
// } {
//   if (project.featured_asset?.thumbnail_url || project.featured_asset?.url) {
//     return {
//       url: project.featured_asset.thumbnail_url ?? project.featured_asset.url!,
//       isPlaceholder: false,
//     };
//   }
//   if (project.featured_asset_id && project.assets?.length) {
//     const featured = project.assets.find(
//       (a) => a.id === project.featured_asset_id
//     );
//     if (featured?.thumbnail_url || featured?.url) {
//       return {
//         url: featured.thumbnail_url ?? featured.url!,
//         isPlaceholder: false,
//       };
//     }
//   }
//   const firstWithThumb = project.assets?.find((a) => !!a.thumbnail_url);
//   if (firstWithThumb)
//     return { url: firstWithThumb.thumbnail_url!, isPlaceholder: false };
//   const first = project.assets?.[0];
//   if (first?.url) return { url: first.url!, isPlaceholder: false };
//   return { url: PLACEHOLDER_SRC, isPlaceholder: true };
// }

// export async function resetToPlaceholder(projectId: string) {
//   try {
//     const res = await fetch(`/api/projects/${projectId}/reset-cover`, {
//       method: "POST",
//       credentials: "include",
//       headers: { "Content-Type": "application/json" },
//     });

//     if (!res.ok) {
//       throw new Error(`Failed to reset cover: ${res.status}`);
//     }

//     return await res.json();
//   } catch (err) {
//     console.error("Error resetting project cover:", err);
//     throw err;
//   }
// }

// /**
//  * Sets a specific asset as the cover for a project.
//  */
// export async function setAsCover(projectId: string, assetId: string) {
//   try {
//     const res = await fetch(`/api/projects/${projectId}/set-cover`, {
//       method: "POST",
//       credentials: "include",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ assetId }),
//     });

//     if (!res.ok) {
//       throw new Error(`Failed to set cover: ${res.status}`);
//     }

//     return await res.json();
//   } catch (err) {
//     console.error("Error setting project cover:", err);
//     throw err;
//   }
// }

// src/lib/project-utils.ts
import type { Project } from "@/types/project";
import type { ComponentType } from "react";
import type { GeneratedAsset } from "@/types/generatedAsset";
import {
  BookOpen,
  Music2,
  ImageIcon,
  Star,
  Megaphone,
  Shirt,
  Gamepad2,
  Mic2,
  Clapperboard,
} from "lucide-react";
import {
  SiInstagram,
  SiFacebook,
  SiX,
  SiLinkedin,
  SiYoutube,
  SiPinterest,
} from "react-icons/si";

// ===== Project kinds you support now =====
export type ProjectKind =
  | "book"
  | "branding"
  | "fashion"
  | "game"
  | "music"
  | "podcast"
  | "video";

// Normalize free-form strings coming from DB / UI
export function normalizeProjectType(input?: string): ProjectKind | "other" {
  const t = (input ?? "").trim().toLowerCase();
  if (t.includes("book")) return "book";
  if (t.includes("brand")) return "branding";
  if (t.includes("fashion")) return "fashion";
  if (t.includes("game")) return "game";
  if (t.includes("music") || t.includes("band")) return "music";
  if (t.includes("podcast")) return "podcast";
  if (t.includes("video")) return "video";
  return "other";
}

// Channels
export type ChannelKey =
  | "Book"
  | "Instagram"
  | "Facebook"
  | "X"
  | "LinkedIn"
  | "YouTube"
  | "Pinterest"
  | "Ads";

// store **components**, not JSX elements
export type IconComponent = ComponentType<{ className?: string }>;

export const CHANNEL_ICON: Record<ChannelKey, IconComponent> = {
  Book: BookOpen,
  Instagram: SiInstagram,
  Facebook: SiFacebook,
  X: SiX,
  LinkedIn: SiLinkedin,
  YouTube: SiYoutube,
  Pinterest: SiPinterest,
  Ads: Star, // or Megaphone
};

// status → shadcn badge variant
export function variantForStatus(
  status?: string
): "pending" | "secondary" | "default" | "destructive" | "outline" {
  const s = (status ?? "").toUpperCase();
  if (s === "READY" || s === "ACTIVE") return "default";
  if (s === "PENDING" || s === "PROCESSING") return "pending";
  if (s === "FAILED") return "destructive";
  return "outline";
}

// Accent ring per type
export function typeAccentClasses(projectType?: string): string {
  switch (normalizeProjectType(projectType)) {
    case "book":
      return "ring-2 ring-purple-300/60";
    case "music":
      return "ring-2 ring-rose-300/60";
    case "branding":
      return "ring-2 ring-sky-300/60";
    case "fashion":
      return "ring-2 ring-pink-300/60";
    case "game":
      return "ring-2 ring-emerald-300/60";
    case "podcast":
      return "ring-2 ring-amber-300/60";
    case "video":
      return "ring-2 ring-indigo-300/60";
    case "other":
    default:
      return "ring-2 ring-muted/40";
  }
}

// Return a **component reference**; consumer will render <Icon className="..." />
export function iconForProjectType(projectType?: string): IconComponent {
  switch (normalizeProjectType(projectType)) {
    case "book":
      return BookOpen;
    case "music":
      return Music2;
    case "branding":
      return Megaphone;
    case "fashion":
      return Shirt;
    case "game":
      return Gamepad2;
    case "podcast":
      return Mic2;
    case "video":
      return Clapperboard;
    case "other":
    default:
      return ImageIcon;
  }
}

// Channels inferred from assets
export function inferChannels(assets?: GeneratedAsset[]): ChannelKey[] {
  if (!assets) return [];
  const names = new Set<ChannelKey>();
  for (const asset of assets) {
    const typeName = asset.asset_type?.name?.toLowerCase() ?? "";
    if (!typeName) continue;
    if (
      typeName.includes("kdp") ||
      typeName.includes("print") ||
      typeName.includes("ebook") ||
      typeName.includes("audible")
    )
      names.add("Book");
    if (typeName.includes("instagram")) names.add("Instagram");
    if (typeName.includes("facebook")) names.add("Facebook");
    if (typeName.includes("twitter") || typeName.includes("x/")) names.add("X");
    if (typeName.includes("linkedin")) names.add("LinkedIn");
    if (typeName.includes("youtube")) names.add("YouTube");
    if (typeName.includes("pinterest")) names.add("Pinterest");
    if (
      typeName.includes("ad") ||
      typeName.includes("gdn") ||
      typeName.includes("display")
    )
      names.add("Ads");
  }
  return Array.from(names);
}

export const UNIVERSAL_CHANNELS: ChannelKey[] = [
  "Instagram",
  "Facebook",
  "X",
  "LinkedIn",
  "YouTube",
  "Pinterest",
  "Ads",
];

export function baselineChannelsFor(project: Project): ChannelKey[] {
  const list = [...UNIVERSAL_CHANNELS];
  if (normalizeProjectType(project.type) === "book") list.unshift("Book");
  return list;
}

export function channelActive(assetTypeName: string, channel: ChannelKey) {
  const t = assetTypeName.toLowerCase();
  switch (channel) {
    case "Book":
      return (
        t.includes("kdp") ||
        t.includes("print") ||
        t.includes("ebook") ||
        t.includes("audible")
      );
    case "Instagram":
      return t.includes("instagram");
    case "Facebook":
      return t.includes("facebook");
    case "X":
      return t.includes("twitter") || t.includes("x/");
    case "LinkedIn":
      return t.includes("linkedin");
    case "YouTube":
      return t.includes("youtube");
    case "Pinterest":
      return t.includes("pinterest");
    case "Ads":
      return t.includes("ad") || t.includes("gdn") || t.includes("display");
  }
}

// ==== Placeholder images by type (put your JPGs in /public) ====
const TYPE_PLACEHOLDER: Record<ProjectKind, string> = {
  book: "/books.jpg",
  branding: "/branding.jpg",
  fashion: "/fashion.jpg",
  game: "/game.jpg",
  music: "/music.jpg",
  podcast: "/podcast.jpg",
  video: "/video.jpg",
};

export function placeholderForType(projectType?: string): string {
  const kind = normalizeProjectType(projectType);
  if (kind === "other") return "/books.jpg"; // fallback
  return TYPE_PLACEHOLDER[kind];
}

// Keep your previous preview logic; fall back to type placeholder
export function getPreviewUrl(project: Project): {
  url: string;
  isPlaceholder: boolean;
} {
  if (project.featured_asset?.thumbnail_url || project.featured_asset?.url) {
    return {
      url: project.featured_asset.thumbnail_url ?? project.featured_asset.url!,
      isPlaceholder: false,
    };
  }
  if (project.featured_asset_id && project.assets?.length) {
    const featured = project.assets.find(
      (a) => a.id === project.featured_asset_id
    );
    if (featured?.thumbnail_url || featured?.url) {
      return {
        url: featured.thumbnail_url ?? featured.url!,
        isPlaceholder: false,
      };
    }
  }
  const firstWithThumb = project.assets?.find((a) => !!a.thumbnail_url);
  if (firstWithThumb)
    return { url: firstWithThumb.thumbnail_url!, isPlaceholder: false };
  const first = project.assets?.[0];
  if (first?.url) return { url: first.url!, isPlaceholder: false };
  // -> type-based placeholder
  return { url: placeholderForType(project.type), isPlaceholder: true };
}

export async function resetToPlaceholder(projectId: string) {
  try {
    const res = await fetch(`/api/projects/${projectId}/reset-cover`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      throw new Error(`Failed to reset cover: ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    console.error("Error resetting project cover:", err);
    throw err;
  }
}

/** Sets a specific asset as the cover for a project. */
export async function setAsCover(projectId: string, assetId: string) {
  try {
    const res = await fetch(`/api/projects/${projectId}/set-cover`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId }),
    });

    if (!res.ok) {
      throw new Error(`Failed to set cover: ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    console.error("Error setting project cover:", err);
    throw err;
  }
}
