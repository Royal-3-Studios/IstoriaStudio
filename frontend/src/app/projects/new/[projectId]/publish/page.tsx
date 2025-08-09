// src/app/(app)/projects/[projectId]/publish/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Project } from "@/types/project";
import type { GeneratedAsset } from "@/types/generatedAsset";

export default function PublishPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/project?projectId=${projectId}`, {
          credentials: "include",
        });
        const data = await res.json();
        const p = Array.isArray(data)
          ? data.find((x: Project) => x.id === projectId)
          : data;
        setProject(p ?? null);
      } catch (err) {
        console.error("Failed to load project", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectId]);

  function toggleAsset(id: string) {
    setSelectedAssets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleDownloadSelected() {
    console.log("Downloading assets:", Array.from(selectedAssets));
    // TODO: call backend export endpoint with selected asset IDs
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Publish / Export</h1>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            project && (
              <div className="text-sm text-muted-foreground">
                {project.title} — Status: {project.status}
              </div>
            )
          )}
        </div>
        <Button
          onClick={handleDownloadSelected}
          disabled={selectedAssets.size === 0}
        >
          Download Selected ({selectedAssets.size})
        </Button>
      </header>

      {/* Assets Selection */}
      {project?.assets && project.assets.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {project.assets.map((asset: GeneratedAsset) => (
            <Card key={asset.id} className="flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3">
                <CardTitle className="text-xs font-normal text-muted-foreground">
                  {asset.asset_type?.name ?? "Asset"}
                </CardTitle>
                <Checkbox
                  checked={selectedAssets.has(asset.id)}
                  onCheckedChange={() => toggleAsset(asset.id)}
                />
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
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => console.log("Download asset", asset.id)}
                >
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

      {/* Packs Section */}
      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Packs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Choose preset bundles to export (Book Pack, Social Pack, Ads
              Pack).
            </p>
            <div className="flex gap-2 mt-2">
              <Button variant="secondary">Book Pack</Button>
              <Button variant="secondary">Social Pack</Button>
              <Button variant="secondary">Ads Pack</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Content Kit</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Auto-generated titles, blurbs, ad headlines, captions & hashtags
              (editable).
            </p>
            <div className="mt-2 flex gap-2">
              <Button variant="secondary">Copy JSON</Button>
              <Button variant="secondary">Copy All Text</Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Integrations Section */}
      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Connect channels to publish directly (KDP pack, Meta, X/Twitter,
            etc.).
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary">Connect Amazon KDP</Button>
            <Button variant="secondary">Connect Instagram</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
