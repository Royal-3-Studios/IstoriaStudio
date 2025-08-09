// src/app/(app)/projects/[projectId]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Project } from "@/types/project";
import type { GeneratedAsset } from "@/types/generatedAsset";

export default function ProjectHubPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadProject() {
    setLoading(true);
    try {
      // Prefer a dedicated endpoint when available:
      const res = await fetch(`/api/project/${projectId}`, {
        credentials: "include",
      });

      let data: Project | Project[] | null = null;

      if (res.ok) {
        data = await res.json();
      } else {
        // fallback: filter from list endpoint
        const listRes = await fetch(`/api/project`, { credentials: "include" });
        const listData: Project[] = await listRes.json();
        data = listData.find((p) => p.id === projectId) ?? null;
      }

      setProject(Array.isArray(data) ? null : data);
    } catch (err) {
      console.error("Failed to load project", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProject();
  }, [projectId]);

  function handleEdit(assetId: string) {
    router.push(`/projects/${projectId}/editor?assetId=${assetId}`);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold truncate">
          {project?.title ?? "Project"}
        </h1>
        <div className="flex gap-2">
          <Button onClick={() => router.push(`/projects/${projectId}/editor`)}>
            Open Editor
          </Button>
          <Button
            variant="secondary"
            onClick={() => router.push(`/projects/${projectId}/publish`)}
          >
            Publish / Export
          </Button>
        </div>
      </header>

      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {/* Status */}
      {project && (
        <div className="text-sm text-muted-foreground">
          Status: {project.status}
        </div>
      )}

      {/* Assets Grid */}
      {project?.assets && project.assets.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {project.assets.map((asset: GeneratedAsset) => (
            <Card key={asset.id} className="flex flex-col">
              <CardHeader className="p-3">
                <CardTitle className="text-xs font-normal text-muted-foreground">
                  {asset.asset_type?.name ?? "Asset"}
                </CardTitle>
              </CardHeader>

              <CardContent className="p-3">
                {asset.thumbnail_url ? (
                  <Image
                    src={asset.thumbnail_url}
                    alt={asset.asset_type?.name ?? "Asset"}
                    width={800}
                    height={600}
                    className="w-full h-auto rounded"
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">
                    No preview available
                  </div>
                )}
              </CardContent>

              <CardFooter className="p-3 flex gap-2 mt-auto">
                <Button size="sm" onClick={() => handleEdit(asset.id)}>
                  Edit
                </Button>
                <Button size="sm" variant="secondary">
                  Download
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        !loading && (
          <div className="text-sm text-muted-foreground">
            No assets found for this project.
          </div>
        )
      )}
    </div>
  );
}
