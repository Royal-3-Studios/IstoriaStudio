// src/components/editor/PresetGallery.tsx
"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type Preset = {
  id: string;
  label: string;
  width: number;
  height: number;
  company?: string;
};

type Props = {
  presets: Preset[];
  value: string | null;
  onChangeAction: (id: string) => void;
  projectType?: string;
  showFilters?: boolean;
};

const PREVIEW_H = {
  base: "h-40",
  sm: "sm:h-44",
  md: "md:h-48",
};

function ContainedPreview({
  w,
  h,
  className = "",
}: {
  w: number;
  h: number;
  className?: string;
}) {
  const landscape = w > h;
  const style: React.CSSProperties = landscape
    ? {
        aspectRatio: `${w} / ${h}`,
        width: "100%",
        height: "auto",
        maxHeight: "100%",
      }
    : {
        aspectRatio: `${w} / ${h}`,
        height: "100%",
        width: "auto",
        maxWidth: "100%",
      };

  return (
    <div
      className={[
        "relative w-full overflow-hidden rounded-md",
        PREVIEW_H.base,
        PREVIEW_H.sm,
        PREVIEW_H.md,
        "grid place-items-center p-0",
        className,
      ].join(" ")}
    >
      <div
        className="relative rounded-[2px] border-2 border-neutral-400/70 bg-white"
        style={style}
      />
    </div>
  );
}

export default function PresetGallery({
  presets,
  value,
  onChangeAction,
}: Props) {
  const [q, setQ] = useState("");
  const [w, setW] = useState<number | "">("");
  const [h, setH] = useState<number | "">("");

  const filtered = useMemo(() => {
    const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return presets.filter((p) => {
      const hay = `${p.company ?? ""} ${p.label ?? ""}`.toLowerCase();
      const textOk = words.length === 0 || words.every((t) => hay.includes(t));
      const wOk = w === "" || p.width === w;
      const hOk = h === "" || p.height === h;
      return textOk && wOk && hOk;
    });
  }, [presets, q, w, h]);

  const groups = useMemo(() => {
    const map = new Map<string, Preset[]>();
    for (const p of filtered) {
      const key = p.company ?? "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    for (const arr of map.values())
      arr.sort((a, b) => a.label.localeCompare(b.label));
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex flex-col gap-2 md:gap-6 sm:flex-row sm:items-center justify-center">
        <Input
          placeholder='Search company or name (e.g. "Google", "Cover", "1200x628" in text is also fine)'
          value={q}
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            const m = v.match(/(\d+)\s*[x×]\s*(\d+)/i);
            if (m) {
              const W = Number(m[1]),
                H = Number(m[2]);
              if (!Number.isNaN(W)) setW(W);
              if (!Number.isNaN(H)) setH(H);
            }
          }}
          className="max-w-96 rounded-full"
        />
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            placeholder="W"
            min={1}
            value={w}
            onChange={(e) => setW(e.target.value ? Number(e.target.value) : "")}
            className="max-w-24 rounded-full text-center"
          />
          <Input
            type="number"
            inputMode="numeric"
            placeholder="H"
            min={1}
            value={h}
            onChange={(e) => setH(e.target.value ? Number(e.target.value) : "")}
            className="max-w-24 rounded-full text-center"
          />
        </div>
      </div>

      <div className="taco min-h-0 flex-1 overflow-y-auto pr-1">
        {groups.map(([company, items], gi) => (
          <section key={company} className={gi ? "mt-6" : ""}>
            <div className="mb-2 text-[11px] sm:text-xs uppercase tracking-wide text-muted-foreground">
              {company}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 sm:gap-4 px-2 xl:px-6">
              {items.map((p) => (
                <Card
                  key={p.id}
                  className={[
                    "h-full border bg-card/60 shadow-sm transition",
                    "hover:shadow-md hover:-translate-y-0.5",
                    value === p.id ? "ring-2 ring-primary" : "",
                    "p-3 sm:p-4 rounded-lg",
                  ].join(" ")}
                >
                  <div className="flex h-full flex-col">
                    {/* Fixed-size, centered, contained preview */}
                    <ContainedPreview w={p.width} h={p.height} />

                    <div className="mt-auto pt-1">
                      <div className="mb-2 space-y-1">
                        <div className="text-sm font-medium leading-tight">
                          {p.label}
                        </div>
                        <div className="text-[11px] sm:text-xs text-muted-foreground">
                          {p.company ?? "Other"} • {p.width}×{p.height}
                        </div>
                      </div>

                      <Button
                        size="sm"
                        className="w-full rounded-full cursor-pointer"
                        onClick={() => onChangeAction(p.id)}
                        variant={value === p.id ? "secondary" : "default"}
                        aria-label={
                          value === p.id ? "Preset selected" : "Choose preset"
                        }
                      >
                        {value === p.id ? "Selected" : "Choose"}
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
