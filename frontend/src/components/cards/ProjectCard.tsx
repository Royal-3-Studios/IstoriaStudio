// src/components/cards/ProjectCard.tsx
"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { MoreHorizontal, Star, Trash2 } from "lucide-react";

import type { Project } from "@/types/project";
import {
  type ChannelKey,
  getPreviewUrl,
  inferChannels,
  baselineChannelsFor,
  channelActive,
  CHANNEL_ICON,
  typeAccentClasses,
  iconForProjectType,
  variantForStatus,
} from "@/lib/project-utils";
import {
  deleteProject,
  resetProjectCover,
  setProjectCover,
  type DeleteCascade,
} from "@/lib/api/projects";

type ChangeEvent =
  | { type: "deleted"; id: string }
  | { type: "cover"; id: string };

type Props = {
  project: Project;
  onChanged?: (e: ChangeEvent) => void;
};

export function ProjectCard({ project, onChanged }: Props): React.ReactElement {
  const router = useRouter();

  const [coverBusy, setCoverBusy] = React.useState<boolean>(false);
  const [deleteOpen, setDeleteOpen] = React.useState<boolean>(false);
  const [deleteBusy, setDeleteBusy] = React.useState<boolean>(false);

  const { url: previewUrl, isPlaceholder } = getPreviewUrl(project);
  const detectedChannels = inferChannels(project.assets);
  const fallbackChannels = baselineChannelsFor(project);
  const channelsToShow = detectedChannels.length
    ? detectedChannels
    : fallbackChannels;

  const TypeIcon = iconForProjectType(project.type);
  const isChannelActive = (channel: ChannelKey): boolean =>
    (project.assets ?? []).some((a) =>
      a.asset_type?.name ? channelActive(a.asset_type.name, channel) : false
    );

  const handleUsePlaceholder = async (): Promise<void> => {
    try {
      setCoverBusy(true);
      await resetProjectCover(project.id);
      toast.success("Cover reset to placeholder");
      onChanged?.({ type: "cover", id: project.id });
    } catch (err) {
      toast.error("Failed to reset cover");
      console.error(err);
    } finally {
      setCoverBusy(false);
    }
  };

  const handleSetCover = async (assetId: string): Promise<void> => {
    try {
      setCoverBusy(true);
      await setProjectCover(project.id, assetId);
      toast.success("Cover updated");
      onChanged?.({ type: "cover", id: project.id });
    } catch (err) {
      toast.error("Failed to set cover");
      console.error(err);
    } finally {
      setCoverBusy(false);
    }
  };

  async function handleDelete(cascade: DeleteCascade): Promise<void> {
    try {
      setDeleteBusy(true);
      await deleteProject(project.id, cascade);
      toast.success(
        cascade === "project_and_assets"
          ? "Project & assets deleted"
          : "Project deleted"
      );
      setDeleteOpen(false);
      onChanged?.({ type: "deleted", id: project.id });
    } catch (err) {
      toast.error("Delete failed");
      console.error(err);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <Card
        className={`w-full overflow-hidden transition-transform duration-200 ease-in-out transform hover:scale-[1.02] hover:shadow-md py-0 ${typeAccentClasses(project.type)}`}
      >
        <div className="@container">
          {/* Default vertical; horizontal when CARD ≥ 700px */}
          <div className="flex flex-col w-full @[700px]:flex-row">
            {/* Image panel */}
            <div className="relative group bg-muted shrink-0 w-full h-48 @[700px]:w-44 @[700px]:h-60">
              <Image
                src={previewUrl}
                alt={`${project.title} ${isPlaceholder ? "placeholder" : "preview"}`}
                width={480}
                height={480}
                className="h-full w-full object-cover"
                priority={false}
              />
              {!isPlaceholder && project.featured_asset_id && (
                <Star className="absolute top-2 right-2 h-5 w-5 drop-shadow" />
              )}

              <div className="absolute inset-0 hidden items-end justify-end p-2 group-hover:flex bg-gradient-to-t from-black/30 via-transparent">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="cursor-pointer"
                      disabled={coverBusy}
                    >
                      <MoreHorizontal className="mr-2 h-4 w-4" />
                      Change cover
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Cover</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleUsePlaceholder}
                      disabled={coverBusy}
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
                              onClick={() => handleSetCover(asset.id)}
                              disabled={coverBusy}
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

            {/* Content */}
            <div className="flex-1 p-4">
              <div className="flex flex-col justify-between h-11/12">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <TypeIcon className="h-4 w-4" />
                    <span className="font-medium truncate">
                      {project.title}
                    </span>
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

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <p className="mb-1">
                    <b>Assets:</b>
                  </p>
                  {channelsToShow.map((channel) => {
                    const active = isChannelActive(channel);
                    const Icon = CHANNEL_ICON[channel];
                    return (
                      <span
                        key={channel}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs border ${
                          active ? "opacity-100" : "opacity-40"
                        }`}
                        title={
                          active
                            ? `${channel} ready`
                            : `${channel} not created yet`
                        }
                      >
                        <Icon className="h-4 w-4" />
                        {channel}
                      </span>
                    );
                  })}
                </div>

                <div className="mt-4 flex gap-2">
                  <Button
                    className="cursor-pointer"
                    onClick={() =>
                      router.push(`/projects/${project.id}/editor`)
                    }
                  >
                    Create & Edit
                  </Button>

                  <Button
                    variant="destructive"
                    onClick={() => setDeleteOpen(true)}
                    className="ml-auto cursor-pointer"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>
              {isPlaceholder && (
                <div className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                  * Placeholder shown
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this project?</DialogTitle>
            <DialogDescription>
              You can delete just the project and keep its assets, or delete the
              project and all of its assets. This action can’t be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-2">
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setDeleteOpen(false)}
                disabled={deleteBusy}
              >
                Cancel
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => void handleDelete("project_only")}
                disabled={deleteBusy}
                title="Delete project only (keep assets)"
              >
                Delete project only
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleDelete("project_and_assets")}
                disabled={deleteBusy}
                title="Delete project and all assets"
              >
                Delete project & assets
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
