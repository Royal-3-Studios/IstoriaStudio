"use client";
import * as React from "react";
import type { BrushPreset } from "@/data/brushPresets";
import type { RenderOptions } from "@/lib/brush/engine";
import {
  BRUSH_SECTIONS,
  type ControlDef,
  type SectionDef,
} from "./brushControlSchema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { drawStrokeToCanvas } from "@/lib/brush/engine";

const GRAIN_KIND_OPTS = ["none", "paper", "canvas", "noise"] as const;

export function BrushSettings({
  preset,
  values,
  onChangeAction,
  onResetAction,
}: {
  preset: BrushPreset;
  values: Record<string, number>;
  onChangeAction: (patch: Record<string, number>) => void;
  onResetAction?: () => void;
}) {
  const sections = BRUSH_SECTIONS;
  const [active, setActive] = React.useState<SectionDef["id"]>(sections[0].id);

  // ---------- Preview (shared engine) ----------
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const overrides: Partial<NonNullable<RenderOptions["overrides"]>> =
    React.useMemo(() => {
      const o: Partial<NonNullable<RenderOptions["overrides"]>> = {};

      // path placement / feel
      if (values.spacing != null) o.spacing = Number(values.spacing); // % of diameter
      if (values.jitter != null) o.jitter = Number(values.jitter); // % of spacing
      if (values.scatter != null) o.scatter = Number(values.scatter); // px
      if (values.count != null)
        o.count = Math.max(1, Math.round(Number(values.count)));

      // tip & orientation
      if (values.angle != null) o.angle = Number(values.angle); // deg
      if (values.hardness != null) o.softness = 100 - Number(values.hardness); // UI hardness -> engine softness

      // dynamics
      if (values.flow != null) o.flow = Number(values.flow);
      if (values.wetEdges != null) o.wetEdges = !!values.wetEdges;

      // grain
      if (values.grainKind != null) {
        const idx = Math.max(
          0,
          Math.min(GRAIN_KIND_OPTS.length - 1, Number(values.grainKind))
        );
        o.grainKind = GRAIN_KIND_OPTS[idx];
      }
      if (values.grainDepth != null) o.grainDepth = Number(values.grainDepth);
      if (values.grainScale != null) {
        // UI uses 100=1.0 convention; engine expects ~0.25..4
        const s = Number(values.grainScale) / 100;
        o.grainScale = Math.max(0.25, Math.min(4, s));
      }
      if (values.grainRotate != null)
        o.grainRotate = Number(values.grainRotate);

      return o;
    }, [values]);

  const sizeParam = preset.params.find((p) => p.type === "size");
  const baseSizePx = Math.max(
    2,
    Math.min(
      28,
      ((values.size ?? sizeParam?.defaultValue ?? 12) as number) *
        (preset.engine.shape?.sizeScale ?? 1)
    )
  );

  React.useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    void drawStrokeToCanvas(el, {
      engine: preset.engine,
      baseSizePx,
      color: "#000000",
      width: 352,
      height: 127,
      pixelRatio: 2,
      seed: 42,
      colorJitter: {
        h: values.hueJitter ?? 0,
        s: values.satJitter ?? 0,
        l: values.brightJitter ?? 0,
        perStamp: !!values.perStamp,
      },
      overrides,
    });
  }, [
    preset.engine,
    baseSizePx,
    overrides,
    values.hueJitter,
    values.satJitter,
    values.brightJitter,
    values.perStamp,
  ]);

  return (
    <div className="space-y-2">
      {/* Live preview strip */}
      <div className="rounded-md border bg-card p-1">
        <canvas ref={canvasRef} className="w-full h-[30px]" />
      </div>

      {/* md+: tabs */}
      <div className="hidden md:block">
        <Tabs
          value={active}
          onValueChange={(v) => setActive(v as SectionDef["id"])}
        >
          <TabsList className="flex flex-wrap justify-start gap-1 h-10">
            {sections.map((s) => (
              <TabsTrigger key={s.id} value={s.id} className="text-xs">
                {s.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {sections.map((s) => (
            <TabsContent key={s.id} value={s.id} className="mt-2">
              <SectionPanel
                section={s}
                values={values}
                onChangeAction={onChangeAction}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* sm: dropdown + panel */}
      <div className="md:hidden space-y-2">
        <Select
          value={active}
          onValueChange={(v) => setActive(v as SectionDef["id"])}
        >
          <SelectTrigger className="h-8 w-full cursor-pointer px-2 text-sm leading-tight">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sections.map((s) => (
              <SelectItem key={s.id} value={s.id} className="py-1 text-sm">
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SectionPanel
          section={sections.find((s) => s.id === active)!}
          values={values}
          onChangeAction={onChangeAction}
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        {!!onResetAction && (
          <button
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => onResetAction?.()}
          >
            Reset to preset
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Panels ---------- */

function SectionPanel({
  section,
  values,
  onChangeAction,
}: {
  section: SectionDef;
  values: Record<string, number>;
  onChangeAction: (patch: Record<string, number>) => void;
}) {
  return (
    <div className="space-y-2">
      {section.controls.map((c) => (
        <ControlRow
          key={c.key}
          control={c}
          value={values[c.key] ?? c.defaultValue}
          onChangeAction={(val) => onChangeAction({ [c.key]: val })}
        />
      ))}
    </div>
  );
}

function ControlRow({
  control,
  value,
  onChangeAction,
}: {
  control: ControlDef;
  value: number;
  onChangeAction: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-card px-2 py-1.5">
      <div className="text-xs text-muted-foreground">{control.label}</div>
      <div className="flex items-center gap-2">
        {control.kind === "slider" && (
          <>
            <input
              type="range"
              min={control.min ?? 0}
              max={control.max ?? 100}
              step={control.step ?? 1}
              value={value}
              onChange={(e) => onChangeAction(Number(e.target.value))}
              className={[
                "h-8 w-40 cursor-pointer appearance-none bg-transparent",
                "[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-muted",
                "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary",
              ].join(" ")}
            />
            <span className="w-10 text-right text-[11px] tabular-nums">
              {Math.round(value)}
            </span>
          </>
        )}
        {control.kind === "toggle" && (
          <input
            type="checkbox"
            className="h-3.5 w-3.5 cursor-pointer accent-primary"
            checked={!!value}
            onChange={(e) => onChangeAction(e.target.checked ? 1 : 0)}
          />
        )}
        {control.kind === "select" && (
          <Select
            value={String(value)}
            onValueChange={(v) => onChangeAction(Number(v))}
          >
            <SelectTrigger className="h-7 w-44 cursor-pointer px-2 text-xs leading-tight">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(control.options ?? []).map((label, idx) => (
                <SelectItem
                  key={idx}
                  value={String(idx)}
                  className="py-1 text-xs"
                >
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}
