// src/app/(app)/projects/[projectId]/editor/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import type { Project } from "@/types/project";
import type { GeneratedAsset } from "@/types/generatedAsset";

export default function EditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const qs = useSearchParams();
  const assetId = qs.get("assetId") ?? undefined;

  const [project, setProject] = useState<Project | null>(null);
  const [active, setActive] = useState<GeneratedAsset | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/project?projectId=${projectId}`, {
        credentials: "include",
      });
      const data = await res.json();
      const p = Array.isArray(data)
        ? data.find((x: Project) => x.id === projectId)
        : data;
      setProject(p ?? null);
      const a =
        (p?.assets ?? []).find((x: GeneratedAsset) => x.id === assetId) ??
        p?.assets?.[0] ??
        null;
      setActive(a ?? null);
    })();
  }, [projectId, assetId]);

  // Quick actions (stubbed)
  function applyPreset(preset: "lighter" | "darker" | "reverse") {
    // TODO: call backend mutate endpoint (/api/project/{id}/asset/{assetId}/adjust)
    console.log("apply", preset, "to", active?.id);
  }

  const title = useMemo(() => project?.title ?? "Editor", [project]);

  return (
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{title}</h1>
        <div className="flex gap-2">
          <Button variant="secondary">Revert</Button>
          <Button>Save</Button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => applyPreset("lighter")}>
          Lighter
        </Button>
        <Button size="sm" onClick={() => applyPreset("darker")}>
          Darker
        </Button>
        <Button size="sm" onClick={() => applyPreset("reverse")}>
          Reverse
        </Button>
        {/* Add: Contrast, Saturation, Hue, Flip, Mirror, Crop, etc. */}
      </div>

      {/* Canvas (placeholder with image preview) */}
      <div className="border rounded-lg p-3 grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2 flex items-center justify-center bg-muted/40 min-h-[400px] rounded">
          {active?.url || active?.thumbnail_url ? (
            <Image
              src={(active.url ?? active.thumbnail_url)!}
              alt="Canvas"
              width={1200}
              height={800}
              className="max-h-[70vh] w-auto rounded"
            />
          ) : (
            <div className="text-sm text-muted-foreground">
              No asset selected
            </div>
          )}
        </div>

        {/* Right panel */}
        <aside className="space-y-3">
          <div className="font-semibold">Layers</div>
          <div className="text-sm text-muted-foreground">
            Coming soon: layer list
          </div>
          <div className="font-semibold">Adjustments</div>
          <div className="text-sm text-muted-foreground">
            Coming soon: sliders & toggles
          </div>
        </aside>
      </div>
    </div>
  );
}
