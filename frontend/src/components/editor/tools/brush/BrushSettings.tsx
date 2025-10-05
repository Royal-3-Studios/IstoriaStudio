// FILE: src/components/editor/tools/brush/BrushSettings.tsx
"use client";

import * as React from "react";
import type { BrushPreset } from "@/data/brushPresets";
import { BRUSH_CATEGORIES, BRUSH_BY_ID } from "@/data/brushPresets";
import type { EngineConfig, RenderOptions } from "@/lib/brush/engine";
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
import { debounce } from "@/lib/shared/timing";

/* ---------- enums mirrored by select controls (indices map to strings) ---------- */
const GRAIN_KIND = ["none", "paper", "canvas", "noise"] as const;
const RIM_MODE = ["auto", "on", "off"] as const;
const GRAIN_MOTION = ["paperLocked", "tipLocked", "smudgeLocked"] as const;
const TAPER_PROFILE = [
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut",
  "expo",
  "custom",
] as const;

/* ---------- deterministic fallbacks so hooks never run conditionally ---------- */
const FALLBACK_ENGINE: EngineConfig = {
  backend: "stamping",
  strokePath: { spacing: 4, jitter: 0, scatter: 0, streamline: 20, count: 1 },
  shape: { type: "round", softness: 50, sizeScale: 1 },
  grain: { kind: "none", depth: 0, scale: 1 },
  rendering: { mode: "marker", wetEdges: false, flow: 100 },
};

const DEFAULT_PRESET: BrushPreset = {
  id: "fallback",
  name: "Fallback Brush",
  params: [
    {
      key: "size",
      label: "Size",
      type: "size",
      defaultValue: 12,
      min: 1,
      max: 100,
      step: 1,
    },
    {
      key: "flow",
      label: "Flow",
      type: "flow",
      defaultValue: 100,
      min: 0,
      max: 100,
      step: 1,
    },
    {
      key: "spacing",
      label: "Spacing",
      type: "spacing",
      defaultValue: 6,
      min: 0,
      max: 100,
      step: 1,
    },
    {
      key: "smoothing",
      label: "Smoothing",
      type: "smoothing",
      defaultValue: 20,
      min: 0,
      max: 100,
      step: 1,
    },
  ],
  engine: FALLBACK_ENGINE,
};

export function BrushSettings({
  preset,
  values,
  onChangeAction,
  onReset,
}: {
  /** Optional. Parent can pass nothing or an unknown id; we handle it. */
  preset?: BrushPreset;
  values: Record<string, number | string>;
  onChangeAction: (patch: Record<string, number | string>) => void;
  onReset?: () => void;
}) {
  /* ---------- stable, unconditional inputs ---------- */
  const sections = BRUSH_SECTIONS;

  // Choose a catalog-based fallback once (no conditionals in render path):
  const CATALOG_FALLBACK =
    BRUSH_CATEGORIES[0]?.brushes?.[0] ??
    Object.values(BRUSH_BY_ID ?? {})[0] ??
    DEFAULT_PRESET;

  // Always resolve a concrete preset (never undefined):
  const safePreset: BrushPreset = preset ?? CATALOG_FALLBACK;

  /* ---------- hooks (always called, no early returns) ---------- */
  const [activeSection, setActiveSection] = React.useState<SectionDef["id"]>(
    sections[0]?.id ?? "general"
  );

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  /** Build runtime overrides from UI values. */
  const runtimeOverrides: Partial<NonNullable<RenderOptions["overrides"]>> =
    React.useMemo(() => {
      const v = values;
      const o: Partial<NonNullable<RenderOptions["overrides"]>> = {};

      // NOTE: spacing/jitter/scatter/count are now handled on engine.strokePath
      // so we intentionally DO NOT mirror them into overrides to avoid conflicts.

      // Per-stamp jitter
      if (v.jitterSize != null)
        o.sizeJitter = clamp01(Number(v.jitterSize) / 100);
      if (v.jitterAngle != null)
        o.angleJitter = clamp(Number(v.jitterAngle), 0, 180);

      // Tip & orientation
      if (v.angle != null) o.angle = Number(v.angle);
      if (v.hardness != null) o.softness = 100 - Number(v.hardness);
      if (v.angleFollowDirection != null)
        o.angleFollowDirection = clamp01(Number(v.angleFollowDirection));

      // Dynamics
      if (v.flow != null) o.flow = Number(v.flow);
      if (v.opacity != null) o.opacity = clamp(Number(v.opacity), 0, 100);
      if (v.buildup != null) o.buildup = !!Number(v.buildup);
      if (v.wetEdges != null) o.wetEdges = !!Number(v.wetEdges);

      // Grain
      if (v.grainKind != null)
        o.grainKind =
          GRAIN_KIND[clampIdx(Number(v.grainKind), GRAIN_KIND.length)];
      if (v.grainDepth != null) o.grainDepth = Number(v.grainDepth);
      if (v.grainScale != null)
        o.grainScale = clamp(Number(v.grainScale) / 100, 0.25, 4);
      if (v.grainRotate != null) o.grainRotate = Number(v.grainRotate);
      if (v.grainMotion != null)
        o.grainMotion =
          GRAIN_MOTION[clampIdx(Number(v.grainMotion), GRAIN_MOTION.length)];

      // Paper tooth
      if (v.toothBody != null) o.toothBody = clamp01(Number(v.toothBody));
      if (v.toothFlank != null) o.toothFlank = clamp01(Number(v.toothFlank));
      if (v.toothScale != null) {
        const px = Math.round(Number(v.toothScale));
        o.toothScale = px <= 0 ? 0 : clamp(px, 2, 64);
      }

      // Taper / body shaping
      if (v.tipScaleStart != null)
        o.tipScaleStart = clamp01(Number(v.tipScaleStart));
      if (v.tipScaleEnd != null) o.tipScaleEnd = clamp01(Number(v.tipScaleEnd));
      if (v.tipMinPx != null)
        o.tipMinPx = Math.max(0, Math.round(Number(v.tipMinPx)));
      if (v.bellyGain != null) o.bellyGain = clamp(Number(v.bellyGain), 0.5, 2);
      if (v.endBias != null) o.endBias = clamp(Number(v.endBias), -1, 1);
      if (v.uniformity != null) o.uniformity = clamp01(Number(v.uniformity));

      // Friendly aliases
      if (v.taperStart != null) o.tipScaleStart = clamp01(Number(v.taperStart));
      if (v.taperEnd != null) o.tipScaleEnd = clamp01(Number(v.taperEnd));
      if (v.taperBias != null) o.endBias = clamp(Number(v.taperBias), -1, 1);

      if (v.tipRoundness != null)
        o.tipRoundness = clamp01(Number(v.tipRoundness));
      if (v.thicknessCurve != null)
        o.thicknessCurve = clamp(Number(v.thicknessCurve), 0.2, 3);

      // Taper profile enums
      if (v.taperProfileStart != null)
        o.taperProfileStart =
          TAPER_PROFILE[
            clampIdx(Number(v.taperProfileStart), TAPER_PROFILE.length)
          ];
      if (v.taperProfileEnd != null)
        o.taperProfileEnd =
          TAPER_PROFILE[
            clampIdx(Number(v.taperProfileEnd), TAPER_PROFILE.length)
          ];

      // Optional JSON curves
      if (
        typeof v.taperProfileStartCurve === "string" &&
        v.taperProfileStartCurve.trim()
      ) {
        try {
          o.taperProfileStartCurve = JSON.parse(
            String(v.taperProfileStartCurve)
          );
        } catch {}
      }
      if (
        typeof v.taperProfileEndCurve === "string" &&
        v.taperProfileEndCurve.trim()
      ) {
        try {
          o.taperProfileEndCurve = JSON.parse(String(v.taperProfileEndCurve));
        } catch {}
      }

      // Split nibs
      if (v.splitCount != null)
        o.splitCount = Math.max(1, Math.round(Number(v.splitCount)));
      if (v.splitSpacing != null)
        o.splitSpacing = Math.max(0, Number(v.splitSpacing));
      if (v.splitSpacingJitter != null)
        o.splitSpacingJitter = clamp(Number(v.splitSpacingJitter), 0, 100);
      if (v.splitCurvature != null)
        o.splitCurvature = clamp(Number(v.splitCurvature), -1, 1);
      if (v.splitAsymmetry != null)
        o.splitAsymmetry = clamp(Number(v.splitAsymmetry), -1, 1);
      if (v.splitScatter != null)
        o.splitScatter = Math.max(0, Number(v.splitScatter));
      if (v.splitAngle != null) o.splitAngle = Number(v.splitAngle);
      if (v.pressureToSplitSpacing != null)
        o.pressureToSplitSpacing = clamp01(Number(v.pressureToSplitSpacing));
      if (v.tiltToSplitFan != null)
        o.tiltToSplitFan = clamp(Number(v.tiltToSplitFan), -45, 45);

      // Speed dynamics
      if (v.speedToWidth != null)
        o.speedToWidth = clamp(Number(v.speedToWidth), -1, 1);
      if (v.speedToFlow != null)
        o.speedToFlow = clamp(Number(v.speedToFlow), -1, 1);
      if (v.speedSmoothingMs != null)
        o.speedSmoothingMs = Math.max(
          0,
          Math.round(Number(v.speedSmoothingMs))
        );

      // Tilt routing
      if (v.tiltToSize != null)
        o.tiltToSize = clamp(Number(v.tiltToSize), -1, 1);
      if (v.tiltToFan != null) o.tiltToFan = clamp(Number(v.tiltToFan), -1, 1);
      if (v.tiltToGrainScale != null)
        o.tiltToGrainScale = clamp(Number(v.tiltToGrainScale), -1, 1);
      if (v.tiltToEdgeNoise != null)
        o.tiltToEdgeNoise = clamp(Number(v.tiltToEdgeNoise), -1, 1);

      // Edge noise / dry fringe
      if (v.edgeNoiseStrength != null)
        o.edgeNoiseStrength = clamp01(Number(v.edgeNoiseStrength));
      if (v.edgeNoiseScale != null)
        o.edgeNoiseScale = clamp(Number(v.edgeNoiseScale), 2, 64);
      if (v.dryThreshold != null)
        o.dryThreshold = clamp01(Number(v.dryThreshold));

      // Pencil rim / lighting
      if (v.rimStrength != null) o.rimStrength = clamp01(Number(v.rimStrength));
      if (v.rimMode != null)
        o.rimMode = RIM_MODE[clampIdx(Number(v.rimMode), RIM_MODE.length)];
      if (v.bgIsLight != null) o.bgIsLight = !!Number(v.bgIsLight);

      // Backend-specific
      if (v.smudgeStrength != null) o.smudgeStrength = Number(v.smudgeStrength);
      if (v.smudgeAlpha != null) o.smudgeAlpha = Number(v.smudgeAlpha);
      if (v.smudgeBlur != null) o.smudgeBlur = Number(v.smudgeBlur);
      if (v.smudgeSpacing != null) o.smudgeSpacing = Number(v.smudgeSpacing);

      if (v.innerGrainAlpha != null)
        o.innerGrainAlpha = clamp01(Number(v.innerGrainAlpha));
      if (v.edgeCarveAlpha != null)
        o.edgeCarveAlpha = clamp01(Number(v.edgeCarveAlpha));

      if (v.coreStrength != null) o.coreStrength = Number(v.coreStrength);
      if (v.centerlinePencil != null)
        o.centerlinePencil = !!Number(v.centerlinePencil);

      return o;
    }, [values]);

  // Merge UI values into the base engine for preview
  const previewEngine: EngineConfig = React.useMemo(() => {
    const src = safePreset.engine ?? FALLBACK_ENGINE;

    // Ensure spacing/jitter/scatter/count live on strokePath (percent-based spacing)
    const strokePath = {
      ...src.strokePath,
      ...(values.spacing != null
        ? { spacing: Math.round(Number(values.spacing)) }
        : {}),
      ...(values.jitter != null ? { jitter: Number(values.jitter) } : {}),
      ...(values.scatter != null ? { scatter: Number(values.scatter) } : {}),
      ...(values.count != null
        ? { count: Math.max(1, Math.round(Number(values.count))) }
        : {}),
      ...(values.smoothing != null
        ? { streamline: Number(values.smoothing) }
        : {}),
    };

    const shape = {
      ...src.shape,
      ...(values.angle != null ? { angle: Number(values.angle) } : {}),
      // If you want hardness->softness mapping at engine level:
      // ...(values.hardness != null ? { softness: 100 - Number(values.hardness) } : {}),
    };

    const gkIdx =
      values.grainKind != null
        ? clampIdx(Number(values.grainKind), GRAIN_KIND.length)
        : -1;

    const grain = {
      ...src.grain,
      ...(gkIdx >= 0 ? { kind: GRAIN_KIND[gkIdx] } : {}),
      ...(values.grainDepth != null
        ? { depth: Number(values.grainDepth) }
        : {}),
      ...(values.grainScale != null
        ? { scale: clamp(Number(values.grainScale) / 100, 0.25, 4) }
        : {}),
      ...(values.grainRotate != null
        ? { rotate: Number(values.grainRotate) }
        : {}),
    };

    const rendering = {
      ...src.rendering,
      ...(values.wetEdges != null
        ? { wetEdges: !!Number(values.wetEdges) }
        : {}),
      ...(values.flow != null ? { flow: Number(values.flow) } : {}),
    };

    return {
      ...src,
      strokePath,
      shape,
      grain,
      rendering,
      overrides: { ...src.overrides, ...runtimeOverrides },
    };
  }, [safePreset, values, runtimeOverrides]);

  // Preview brush size
  const sizeParam = React.useMemo(
    () => safePreset.params.find((p) => p.type === "size"),
    [safePreset]
  );
  const baseSizePx = React.useMemo(() => {
    const uiSize = Number(values.size ?? sizeParam?.defaultValue ?? 12);
    const scale = previewEngine.shape?.sizeScale ?? 1;
    return clamp(Math.round(uiSize * scale), 2, 28);
  }, [values.size, sizeParam, previewEngine.shape?.sizeScale]);

  // Debounced renderer (stable ref)
  const debouncedRenderPreview = React.useRef(
    debounce(
      (canvas: HTMLCanvasElement, opts: RenderOptions) => {
        void drawStrokeToCanvas(canvas, opts);
      },
      40,
      { trailing: true, leading: false, maxWait: 100 }
    )
  ).current;

  // Always run effect; it no-ops if canvas missing
  React.useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const opts: RenderOptions = {
      engine: previewEngine,
      baseSizePx,
      color: "#000000",
      width: 352,
      height: 127,
      pixelRatio: 2,
      seed: 42,
      colorJitter: {
        h: Number(values.hueJitter ?? 0),
        s: Number(values.satJitter ?? 0),
        l: Number(values.brightJitter ?? 0),
        perStamp: !!Number(values.perStamp),
      },
      overrides: runtimeOverrides,
    };

    debouncedRenderPreview(canvasEl, opts);
  }, [
    previewEngine,
    baseSizePx,
    runtimeOverrides,
    values.hueJitter,
    values.satJitter,
    values.brightJitter,
    values.perStamp,
    debouncedRenderPreview,
  ]);

  React.useEffect(() => {
    return () => {
      debouncedRenderPreview.cancel();
    };
  }, [debouncedRenderPreview]);

  /* ---------- UI ---------- */
  return (
    <div className="space-y-2">
      {/* Preview strip */}
      <div className="rounded-md border bg-card p-1">
        <canvas ref={canvasRef} className="w-full h-[30px]" />
      </div>

      {/* md+: tabs */}
      <div className="hidden md:block">
        <Tabs
          value={activeSection}
          onValueChange={(v) => setActiveSection(v as SectionDef["id"])}
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

      {/* sm: dropdown + active panel */}
      <div className="md:hidden space-y-2">
        <Select
          value={activeSection}
          onValueChange={(v) => setActiveSection(v as SectionDef["id"])}
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
          section={sections.find((s) => s.id === activeSection) ?? sections[0]}
          values={values}
          onChangeAction={onChangeAction}
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        {!!onReset && (
          <button
            className="text-xs text-muted-foreground hover:underline"
            onClick={() => onReset?.()}
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
  values: Record<string, number | string>;
  onChangeAction: (patch: Record<string, number | string>) => void;
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
  value: number | string;
  onChangeAction: (value: number | string) => void;
}) {
  const numericValue = Number(value);

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
              value={numericValue}
              onChange={(e) => onChangeAction(Number(e.target.value))}
              className={[
                "h-8 w-40 cursor-pointer appearance-none bg-transparent",
                "[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-muted",
                "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary",
              ].join(" ")}
            />
            <span className="w-10 text-right text-[11px] tabular-nums">
              {Math.round(numericValue)}
            </span>
          </>
        )}

        {control.kind === "toggle" && (
          <input
            type="checkbox"
            className="h-3.5 w-3.5 cursor-pointer accent-primary"
            checked={!!numericValue}
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

/* ---------- tiny helpers ---------- */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function clamp01(v: number): number {
  return clamp(v, 0, 1);
}
function clampIdx(i: number, len: number): number {
  if (!Number.isFinite(i)) return 0;
  return Math.max(0, Math.min(len - 1, Math.floor(i)));
}
