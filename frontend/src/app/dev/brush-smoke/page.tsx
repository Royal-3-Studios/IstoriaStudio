// FILE: src/app/dev/brush-smoke/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  SMOKE_PATHS,
  SMOKE_CANVAS_W,
  SMOKE_CANVAS_H,
  type SmokePath,
  toRenderPath,
} from "@/lib/brush/dev/smokePaths";

import { BACKENDS, type BackendAdapter } from "@backends";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Shot = {
  backendId: string;
  pathName: string;
  blobUrl: string;
  fileName: string;
  ok: boolean;
  error?: string;
};

const BASE_EXTRA: Readonly<Record<string, unknown>> = {
  baseSizePx: 16, // common baseline size
  smudgeStrength: 0.7,
  smudgeAlpha: 0.9,
  smudgeBlur: 0.5,
  smudgeSpacing: 8,
  softness: 60,
  flow: 85,
};

// Optional: per-backend extras (keyed by adapter.id)
const EXTRAS_BY_BACKEND: Readonly<
  Record<string, Readonly<Record<string, unknown>>>
> = {
  ribbon: { mode: "marker", predictPx: 12, coreStrength: 260 },
  // particle: { ... },
  // pattern:  { ... },
  // impasto:  { ... },
};

export default function BrushSmokePage(): React.ReactElement {
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState<boolean>(false);

  // pull adapters from registry
  const adapters = useMemo<BackendAdapter[]>(() => Object.values(BACKENDS), []);

  const clearShots = useCallback(() => {
    setShots((prev) => {
      for (const s of prev) URL.revokeObjectURL(s.blobUrl);
      return [];
    });
  }, []);

  const renderOne = useCallback(
    async (adapter: BackendAdapter, p: SmokePath): Promise<Shot> => {
      // Prefer real device DPR so the test reflects production strokes
      const pixelRatio =
        typeof window !== "undefined"
          ? Math.max(1, Math.floor(window.devicePixelRatio || 1))
          : 1;

      const mergedExtra: Record<string, unknown> = {
        ...BASE_EXTRA,
        ...(EXTRAS_BY_BACKEND[adapter.id] ?? {}),
      };

      try {
        const useOffscreen = typeof OffscreenCanvas !== "undefined";
        let blob: Blob;

        if (useOffscreen) {
          const off = new OffscreenCanvas(SMOKE_CANVAS_W, SMOKE_CANVAS_H);
          await adapter.renderStroke(off, {
            width: SMOKE_CANVAS_W,
            height: SMOKE_CANVAS_H,
            pixelRatio, // ✅ standardized key (not dpr)
            seed: p.seed,
            path: toRenderPath(p.points),
            color: "#353535",
            baseSizePx: 16,
            extra: mergedExtra,
          });
          blob = await off.convertToBlob({ type: "image/png" });
        } else {
          const canvas = document.createElement("canvas");
          canvas.width = SMOKE_CANVAS_W;
          canvas.height = SMOKE_CANVAS_H;

          await adapter.renderStroke(canvas, {
            width: SMOKE_CANVAS_W,
            height: SMOKE_CANVAS_H,
            pixelRatio, // ✅ standardized key (not dpr)
            seed: p.seed,
            path: toRenderPath(p.points),
            color: "#353535",
            baseSizePx: 16,
            extra: mergedExtra,
          });

          blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error("PNG toBlob failed"))),
              "image/png"
            )
          );
        }

        const backendId = adapter.id;
        const fileName = `${backendId}_${p.name}.png`;
        return {
          backendId,
          pathName: p.name,
          blobUrl: URL.createObjectURL(blob),
          fileName,
          ok: true,
        };
      } catch (err) {
        const backendId = adapter.id;
        const fileName = `${backendId}_${p.name}.png`;
        return {
          backendId,
          pathName: p.name,
          blobUrl: "", // none
          fileName,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    []
  );

  const runAll = useCallback(async (): Promise<void> => {
    if (!adapters.length) {
      setShots([
        {
          backendId: "none",
          pathName: "—",
          blobUrl: "",
          fileName: "no_backends.png",
          ok: false,
          error: "No backends registered in BACKENDS.",
        },
      ]);
      return;
    }

    setBusy(true);
    try {
      clearShots();

      const all: Shot[] = [];
      for (const adapter of adapters) {
        for (const p of SMOKE_PATHS) {
          // Render sequentially to keep UI predictable;
          // you can parallelize per path if your adapters are re-entrant.
          const shot = await renderOne(adapter, p);
          all.push(shot);
        }
      }
      setShots(all);
    } finally {
      setBusy(false);
    }
  }, [adapters, clearShots, renderOne]);

  useEffect(() => {
    void runAll();
    return () => {
      // Cleanup created blob URLs on unmount
      setShots((prev) => {
        for (const s of prev) URL.revokeObjectURL(s.blobUrl);
        return prev;
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const download = (shot: Shot): void => {
    if (!shot.ok || !shot.blobUrl) return;
    const a = document.createElement("a");
    a.href = shot.blobUrl;
    a.download = shot.fileName;
    a.click();
  };

  const downloadAll = (): void => {
    shots.forEach(download);
  };

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

            {!s.ok ? (
              <div className="text-red-500 text-xs">
                Failed: {s.error ?? "Unknown error"}
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={s.blobUrl}
                width={SMOKE_CANVAS_W}
                height={SMOKE_CANVAS_H}
                alt={`${s.backendId} - ${s.pathName}`}
                className="w-full h-auto rounded border bg-neutral-900"
              />
            )}

            <div className="mt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => download(s)}
                disabled={!s.ok}
              >
                Download PNG
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
