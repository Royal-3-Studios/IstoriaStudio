"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  MoreHorizontal,
  Star,
  BookOpen,
  Music2,
  Briefcase,
  Megaphone,
  ImageIcon,
} from "lucide-react";
import {
  SiInstagram,
  SiFacebook,
  SiX,
  SiLinkedin,
  SiYoutube,
  SiPinterest,
} from "react-icons/si";

import type { ReactNode } from "react";
import type { Project } from "@/types/project";
import type { GeneratedAsset } from "@/types/generatedAsset";

const PLACEHOLDER_SRC = "/books.jpg"; // public/books.jpg

type ChannelKey =
  | "Book"
  | "Instagram"
  | "Facebook"
  | "X"
  | "LinkedIn"
  | "YouTube"
  | "Pinterest"
  | "Ads";

const CHANNEL_ICON: Record<ChannelKey, ReactNode> = {
  Book: <BookOpen className="h-4 w-4" />,
  Instagram: <SiInstagram className="h-4 w-4" />,
  Facebook: <SiFacebook className="h-4 w-4" />,
  X: <SiX className="h-4 w-4" />,
  LinkedIn: <SiLinkedin className="h-4 w-4" />,
  YouTube: <SiYoutube className="h-4 w-4" />,
  Pinterest: <SiPinterest className="h-4 w-4" />,
  Ads: <Megaphone className="h-4 w-4" />,
};

function variantForStatus(
  status?: string
): "pending" | "secondary" | "default" | "destructive" | "outline" {
  const s = (status ?? "").toUpperCase();
  if (s === "READY" || s === "ACTIVE") return "default";
  if (s === "PENDING" || s === "PROCESSING") return "pending";
  if (s === "FAILED") return "destructive";
  return "outline";
}

function typeAccentClasses(projectType?: string): string {
  const t = (projectType ?? "").toLowerCase();
  if (t.includes("book")) return "ring-2 ring-purple-300/60";
  if (t.includes("band") || t.includes("music"))
    return "ring-2 ring-rose-300/60";
  if (t.includes("business") || t.includes("brand"))
    return "ring-2 ring-sky-300/60";
  return "ring-2 ring-muted/40";
}

function iconForProjectType(projectType?: string): ReactNode {
  const t = (projectType ?? "").toLowerCase();
  if (t.includes("book")) return <BookOpen className="h-4 w-4" />;
  if (t.includes("band") || t.includes("music"))
    return <Music2 className="h-4 w-4" />;
  if (t.includes("business") || t.includes("brand"))
    return <Briefcase className="h-4 w-4" />;
  return <ImageIcon className="h-4 w-4" />;
}

function inferChannels(assets?: GeneratedAsset[]): ChannelKey[] {
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

function channelActive(assetTypeName: string, channel: ChannelKey) {
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

function getPreviewUrl(project: Project): {
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
  return { url: PLACEHOLDER_SRC, isPlaceholder: true };
}

export default function ProjectsPage() {
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewInline, setShowNewInline] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const router = useRouter();

  useEffect(() => {
    void loadProjects();
  }, []);

  async function loadProjects() {
    try {
      setLoading(true);
      const response = await fetch("/api/project", { credentials: "include" });
      if (!response.ok) throw new Error(await response.text());
      const data: Project[] = await response.json();
      setProjectList(data);
    } finally {
      setLoading(false);
    }
  }

  function openNewCard() {
    setDraftTitle("");
    setDraftDesc("");
    setShowNewInline(true);
  }
  function cancelNewCard() {
    setShowNewInline(false);
    setDraftTitle("");
    setDraftDesc("");
  }

  async function saveNewProject() {
    if (!draftTitle.trim()) return;
    const response = await fetch("/api/project", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: draftTitle.trim(),
        description: draftDesc.trim() || null,
        type: "book", // or let users choose later
        is_active: true,
      }),
    });
    if (!response.ok) {
      console.error(await response.text());
      return;
    }
    const body = await response.json();
    const newId: string | undefined = body.id ?? body?.project?.id;

    // Option A: go to the project page immediately:
    // if (newId) return router.push(`/projects/${newId}`);

    // Option B: stay and refresh list, converting the inline card to a real card:
    await loadProjects();
    setShowNewInline(false);
  }

  async function setAsCover(projectId: string, assetId: string) {
    await fetch(`/api/project/${projectId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ featured_asset_id: assetId }),
    });
    setProjectList((prev) =>
      prev.map((project) =>
        project.id === projectId
          ? {
              ...project,
              featured_asset_id: assetId,
              featured_asset:
                project.assets?.find((a) => a.id === assetId) ??
                project.featured_asset,
            }
          : project
      )
    );
  }

  async function resetToPlaceholder(projectId: string) {
    await fetch(`/api/project/${projectId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ featured_asset_id: null }),
    });
    setProjectList((prev) =>
      prev.map((project) =>
        project.id === projectId
          ? { ...project, featured_asset_id: null, featured_asset: null }
          : project
      )
    );
  }

  function ProjectCard({ project }: { project: Project }) {
    const { url: previewUrl, isPlaceholder } = getPreviewUrl(project);
    const channels = inferChannels(project.assets);
    const activeFor = (channel: ChannelKey) =>
      (project.assets ?? []).some((a) =>
        a.asset_type?.name ? channelActive(a.asset_type.name, channel) : false
      );

    return (
      <Card
        className={`overflow-hidden transition hover:shadow-md py-0 ${typeAccentClasses(project.type)}`}
      >
        <div className="flex w-full">
          {/* Left image panel */}
          <div className="relative group w-40 md:w-56 shrink-0 bg-muted">
            <Image
              src={previewUrl}
              alt={`${project.title} ${isPlaceholder ? "placeholder" : "preview"}`}
              width={448}
              height={448}
              className="h-full w-full object-cover"
            />
            {!isPlaceholder && project.featured_asset_id && (
              <Star className="absolute top-2 right-2 h-5 w-5 drop-shadow" />
            )}
            <div className="absolute inset-0 hidden items-end justify-end p-2 group-hover:flex bg-gradient-to-t from-black/30 via-transparent">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="secondary">
                    <MoreHorizontal className="mr-2 h-4 w-4" />
                    Change cover
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Cover</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => resetToPlaceholder(project.id)}
                  >
                    Use placeholder
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      Set from asset…
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-64 overflow-auto">
                      {project.assets?.length ? (
                        project.assets.map((asset) => (
                          <DropdownMenuItem
                            key={asset.id}
                            onClick={() => setAsCover(project.id, asset.id)}
                          >
                            {asset.asset_type?.name ?? "Asset"}
                            {asset.id === project.featured_asset_id
                              ? " • current"
                              : ""}
                          </DropdownMenuItem>
                        ))
                      ) : (
                        <DropdownMenuItem disabled>
                          No assets yet
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Right content */}
          <div className="flex-1 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {iconForProjectType(project.type)}
                <span className="font-medium truncate">{project.title}</span>
              </div>
              <Badge variant={variantForStatus(project.status)}>
                {project.status ?? "Unknown"}
              </Badge>
            </div>

            {project.description && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {project.description}
              </p>
            )}

            {/* Social/channel row — always visible; dim if no asset for that channel */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {(channels.length
                ? channels
                : ([
                    "Book",
                    "Instagram",
                    "Facebook",
                    "X",
                    "LinkedIn",
                    "YouTube",
                    "Pinterest",
                    "Ads",
                  ] as ChannelKey[])
              ).map((channel) => {
                const isActive = activeFor(channel);
                return (
                  <span
                    key={channel}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs border ${
                      isActive ? "opacity-100" : "opacity-40"
                    }`}
                    title={
                      isActive
                        ? `${channel} ready`
                        : `${channel} not created yet`
                    }
                  >
                    {CHANNEL_ICON[channel]}
                    {channel}
                  </span>
                );
              })}
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                variant="secondary"
                onClick={() => router.push(`/projects/${project.id}`)}
              >
                Open
              </Button>
              <Button
                onClick={() => router.push(`/projects/${project.id}/editor`)}
              >
                Edit
              </Button>
            </div>

            {isPlaceholder && (
              <div className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                Placeholder shown — choose a cover from the “Change cover” menu
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  }

  function NewProjectInlineCard() {
    return (
      <Card className="overflow-hidden ring-2 ring-primary/20">
        <div className="flex w-full">
          {/* Left placeholder panel */}
          <div className="relative w-40 md:w-56 shrink-0 bg-muted">
            <Image
              src={PLACEHOLDER_SRC}
              alt="New project placeholder"
              width={448}
              height={448}
              className="h-full w-full object-cover"
            />
          </div>

          {/* Right form content */}
          <div className="flex-1 p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">Create a new project</span>
              <Badge variant="outline">Draft</Badge>
            </div>

            <div className="mt-3 space-y-2">
              <input
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                placeholder="Project title"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
              />
              <textarea
                className="h-24 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                placeholder="Short description (optional)"
                value={draftDesc}
                onChange={(e) => setDraftDesc(e.target.value)}
              />
            </div>

            <div className="mt-4 flex gap-2">
              <Button onClick={saveNewProject} disabled={!draftTitle.trim()}>
                Save
              </Button>
              <Button variant="secondary" onClick={cancelNewCard}>
                Cancel
              </Button>
            </div>

            <div className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              A placeholder image will be used until you pick a cover.
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <Button onClick={openNewCard}>
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </header>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded" />
          ))}
        </div>
      ) : projectList.length === 0 ? (
        // Empty state: show only the inline new card
        <div className="space-y-4">
          {showNewInline ? (
            <NewProjectInlineCard />
          ) : (
            <div className="text-muted-foreground">
              No projects yet. Click “New Project” to get started.
            </div>
          )}
        </div>
      ) : (
        // Non-empty: single-column list; inline new card appears at the top when toggled
        <div className="space-y-4">
          {showNewInline && <NewProjectInlineCard />}
          {projectList.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
