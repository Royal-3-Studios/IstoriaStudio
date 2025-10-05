// FILE: src/app/dev/brush-smoke/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  SMOKE_PATHS,
  SMOKE_CANVAS_W,
  SMOKE_CANVAS_H,
  type SmokePath,
  toRenderPath,
} from "@/lib/brush/dev/smokePaths";

import {
  BACKEND_ADAPTERS,
  type BackendAdapter, // ✅ works because we re-exported the type
} from "@/lib/brush/backends/adapters";
// If you skipped the re-export, use:

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Shot = {
  backendId: string;
  pathName: string;
  blobUrl: string;
  fileName: string;
};

export default function BrushSmokePage(): React.ReactElement {
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState<boolean>(false);

  // Keep adapters stable for the run
  const adapters = useMemo(() => BACKEND_ADAPTERS, []);

  // Optional: per-backend extras (only used if an adapter consumes them)
  const extrasForBackend: Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  > = {
    ribbon: { mode: "marker", predictPx: 12, coreStrength: 260 },
    // particle: { ... },
    // pattern:  { ... },
    // impasto:  { ... },
  };

  const baseExtra: Readonly<Record<string, unknown>> = {
    baseSizePx: 16, // common baseline
    smudgeStrength: 0.7, // ignored unless smudge backend reads it
    smudgeAlpha: 0.9,
    smudgeBlur: 0.5,
    smudgeSpacing: 8,
    softness: 60,
    flow: 85,
  };

  async function renderOne(
    adapter: BackendAdapter,
    p: SmokePath
  ): Promise<Shot> {
    const dpr = 1;
    const mergedExtra: Record<string, unknown> = {
      ...baseExtra,
      ...(extrasForBackend[adapter.name] ?? {}),
    };

    // Create a canvas (offscreen if available)
    const useOffscreen = typeof OffscreenCanvas !== "undefined";
    let blob: Blob;

    if (useOffscreen) {
      const off = new OffscreenCanvas(SMOKE_CANVAS_W, SMOKE_CANVAS_H);

      await adapter.renderStroke(off, {
        width: SMOKE_CANVAS_W,
        height: SMOKE_CANVAS_H,
        dpr,
        seed: p.seed,
        path: toRenderPath(p.points),
        color: "#353535",
        baseSizePx: 16,
        extra: mergedExtra, // ✅ now used
      });

      blob = await off.convertToBlob({ type: "image/png" });
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = SMOKE_CANVAS_W;
      canvas.height = SMOKE_CANVAS_H;

      await adapter.renderStroke(canvas, {
        width: SMOKE_CANVAS_W,
        height: SMOKE_CANVAS_H,
        dpr,
        seed: p.seed,
        path: toRenderPath(p.points),
        color: "#353535",
        baseSizePx: 16,
        extra: mergedExtra, // ✅ now used
      });

      blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("PNG toBlob failed"))),
          "image/png"
        )
      );
    }

    const backendId = adapter.id ?? "backend";
    const fileName = `${backendId}_${p.name}.png`;
    return {
      backendId,
      pathName: p.name,
      blobUrl: URL.createObjectURL(blob),
      fileName,
    };
  }

  async function runAll(): Promise<void> {
    setBusy(true);
    try {
      // Revoke previous blobs
      setShots((prev) => {
        prev.forEach((s) => URL.revokeObjectURL(s.blobUrl));
        return [];
      });

      const all: Shot[] = [];
      for (const adapter of adapters) {
        for (const p of SMOKE_PATHS) {
          const shot = await renderOne(adapter, p);
          all.push(shot);
        }
      }
      setShots(all);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void runAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function download(shot: Shot): void {
    const a = document.createElement("a");
    a.href = shot.blobUrl;
    a.download = shot.fileName;
    a.click();
  }

  function downloadAll(): void {
    shots.forEach(download);
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Brush Smoke Test</h1>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => void runAll()}
            disabled={busy}
          >
            {busy ? "Rendering…" : "Re-run"}
          </Button>
          <Button onClick={downloadAll} disabled={busy || shots.length === 0}>
            Download PNGs
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shots.map((s) => (
          <Card key={`${s.backendId}_${s.pathName}`} className="p-3">
            <div className="text-xs text-muted-foreground mb-2">
              <div>
                <span className="font-medium">Backend:</span> {s.backendId}
              </div>
              <div>
                <span className="font-medium">Path:</span> {s.pathName}
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.blobUrl}
              width={SMOKE_CANVAS_W}
              height={SMOKE_CANVAS_H}
              alt={`${s.backendId} - ${s.pathName}`}
              className="w-full h-auto rounded border bg-neutral-900"
            />
            <div className="mt-2">
              <Button size="sm" variant="outline" onClick={() => download(s)}>
                Download PNG
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
