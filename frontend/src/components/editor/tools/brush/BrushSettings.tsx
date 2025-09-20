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
import { debounce } from "@/lib/shared/timing";

/** Enum-like option sets mirrored by select controls (indices map to strings). */
const GRAIN_KIND_OPTS = ["none", "paper", "canvas", "noise"] as const;
const RIM_MODE_OPTS = ["auto", "on", "off"] as const;
const GRAIN_MOTION_OPTS = ["paperLocked", "tipLocked", "smudgeLocked"] as const;
const TAPER_PROFILE_OPTS = [
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut",
  "expo",
  "custom",
] as const;

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

  /* ---------- Live preview (shared engine) ---------- */
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const overrides: Partial<NonNullable<RenderOptions["overrides"]>> =
    React.useMemo(() => {
      const o: Partial<NonNullable<RenderOptions["overrides"]>> = {};

      /* -------- Path placement / feel -------- */
      if (values.spacing != null) o.spacing = Number(values.spacing); // % of diameter
      if (values.jitter != null) o.jitter = Number(values.jitter); // % of spacing
      if (values.scatter != null) o.scatter = Number(values.scatter); // px
      if (values.count != null)
        o.count = Math.max(1, Math.round(Number(values.count)));

      /* -------- Tip & orientation -------- */
      if (values.angle != null) o.angle = Number(values.angle); // deg
      if (values.hardness != null) o.softness = 100 - Number(values.hardness); // UI hardness -> engine softness
      if (values.angleJitter != null)
        o.angleJitter = Math.max(0, Math.min(180, Number(values.angleJitter)));
      if (values.angleFollowDirection != null)
        o.angleFollowDirection = Math.max(
          0,
          Math.min(1, Number(values.angleFollowDirection))
        );

      /* -------- Dynamics (flow, opacity, buildup, wet edges) -------- */
      if (values.flow != null) o.flow = Number(values.flow);
      if (values.opacity != null)
        o.opacity = Math.max(0, Math.min(100, Number(values.opacity)));
      if (values.buildup != null) o.buildup = !!values.buildup;
      if (values.wetEdges != null) o.wetEdges = !!values.wetEdges;

      /* -------- Grain -------- */
      if (values.grainKind != null) {
        const idx = Math.max(
          0,
          Math.min(GRAIN_KIND_OPTS.length - 1, Number(values.grainKind))
        );
        o.grainKind = GRAIN_KIND_OPTS[idx];
      }
      if (values.grainDepth != null) o.grainDepth = Number(values.grainDepth);
      if (values.grainScale != null) {
        // UI uses 100 = 1.0; engine expects ~0.25..4
        const s = Number(values.grainScale) / 100;
        o.grainScale = Math.max(0.25, Math.min(4, s));
      }
      if (values.grainRotate != null)
        o.grainRotate = Number(values.grainRotate);
      if (values.grainMotion != null) {
        const idx = Math.max(
          0,
          Math.min(GRAIN_MOTION_OPTS.length - 1, Number(values.grainMotion))
        );
        o.grainMotion = GRAIN_MOTION_OPTS[idx];
      }

      /* -------- Paper tooth (advanced) -------- */
      if (values.toothBody != null)
        o.toothBody = Math.max(0, Math.min(1, Number(values.toothBody)));
      if (values.toothFlank != null)
        o.toothFlank = Math.max(0, Math.min(1, Number(values.toothFlank)));
      if (values.toothScale != null) {
        const px = Math.round(Number(values.toothScale));
        // 0 = auto (backend scales by brush diameter). Else clamp 2..64 px.
        o.toothScale = px <= 0 ? 0 : Math.max(2, Math.min(64, px));
      }

      /* -------- Taper & body shaping (asymmetric allowed) -------- */
      if (values.tipScaleStart != null)
        o.tipScaleStart = Math.max(
          0,
          Math.min(1, Number(values.tipScaleStart))
        ); // 0..1
      if (values.tipScaleEnd != null)
        o.tipScaleEnd = Math.max(0, Math.min(1, Number(values.tipScaleEnd))); // 0..1
      if (values.tipMinPx != null)
        o.tipMinPx = Math.max(0, Math.round(Number(values.tipMinPx))); // px
      if (values.bellyGain != null)
        o.bellyGain = Math.max(0.5, Math.min(2, Number(values.bellyGain))); // 0.5..2
      if (values.endBias != null)
        o.endBias = Math.max(-1, Math.min(1, Number(values.endBias))); // -1..+1
      if (values.uniformity != null)
        o.uniformity = Math.max(0, Math.min(1, Number(values.uniformity))); // 0..1

      // Friendly aliases (if your schema uses these names instead)
      if (values.taperStart != null)
        o.tipScaleStart = Math.max(0, Math.min(1, Number(values.taperStart)));
      if (values.taperEnd != null)
        o.tipScaleEnd = Math.max(0, Math.min(1, Number(values.taperEnd)));
      if (values.taperBias != null)
        o.endBias = Math.max(-1, Math.min(1, Number(values.taperBias)));
      if (values.tipRoundness != null)
        o.tipRoundness = Math.max(0, Math.min(1, Number(values.tipRoundness)));
      if (values.thicknessCurve != null)
        o.thicknessCurve = Math.max(
          0.2,
          Math.min(3, Number(values.thicknessCurve))
        );

      // Taper profiles (enum indices)
      if (values.taperProfileStart != null) {
        const idx = Math.max(
          0,
          Math.min(
            TAPER_PROFILE_OPTS.length - 1,
            Number(values.taperProfileStart)
          )
        );
        o.taperProfileStart = TAPER_PROFILE_OPTS[idx];
      }
      if (values.taperProfileEnd != null) {
        const idx = Math.max(
          0,
          Math.min(
            TAPER_PROFILE_OPTS.length - 1,
            Number(values.taperProfileEnd)
          )
        );
        o.taperProfileEnd = TAPER_PROFILE_OPTS[idx];
      }
      // Custom curves (JSON string of {x,y}[] in 0..1)
      if (
        values.taperProfileStartCurve &&
        typeof values.taperProfileStartCurve === "string"
      ) {
        try {
          o.taperProfileStartCurve = JSON.parse(
            String(values.taperProfileStartCurve)
          );
        } catch {
          /* ignore malformed */
        }
      }
      if (
        values.taperProfileEndCurve &&
        typeof values.taperProfileEndCurve === "string"
      ) {
        try {
          o.taperProfileEndCurve = JSON.parse(
            String(values.taperProfileEndCurve)
          );
        } catch {
          /* ignore malformed */
        }
      }

      /* -------- Split nibs / multi-track (off when count=1) -------- */
      if (values.splitCount != null)
        o.splitCount = Math.max(1, Math.round(Number(values.splitCount))); // 1..16
      if (values.splitSpacing != null)
        o.splitSpacing = Math.max(0, Number(values.splitSpacing)); // px
      if (values.splitSpacingJitter != null)
        o.splitSpacingJitter = Math.max(
          0,
          Math.min(100, Number(values.splitSpacingJitter))
        ); // %
      if (values.splitCurvature != null)
        o.splitCurvature = Math.max(
          -1,
          Math.min(1, Number(values.splitCurvature))
        ); // -1..+1
      if (values.splitAsymmetry != null)
        o.splitAsymmetry = Math.max(
          -1,
          Math.min(1, Number(values.splitAsymmetry))
        ); // -1..+1
      if (values.splitScatter != null)
        o.splitScatter = Math.max(0, Number(values.splitScatter)); // px
      if (values.splitAngle != null) o.splitAngle = Number(values.splitAngle); // deg (base fan)

      // Dynamics routing into split behaviour
      if (values.pressureToSplitSpacing != null)
        o.pressureToSplitSpacing = Math.max(
          0,
          Math.min(1, Number(values.pressureToSplitSpacing))
        ); // 0..1
      if (values.tiltToSplitFan != null)
        o.tiltToSplitFan = Math.max(
          -45,
          Math.min(45, Number(values.tiltToSplitFan))
        ); // deg

      /* -------- Speed dynamics (stroke velocity) -------- */
      if (values.speedToWidth != null)
        o.speedToWidth = Math.max(-1, Math.min(1, Number(values.speedToWidth))); // -1..+1
      if (values.speedToFlow != null)
        o.speedToFlow = Math.max(-1, Math.min(1, Number(values.speedToFlow))); // -1..+1
      if (values.speedSmoothingMs != null)
        o.speedSmoothingMs = Math.max(
          0,
          Math.round(Number(values.speedSmoothingMs))
        ); // ms

      /* -------- Tilt routing -------- */
      if (values.tiltToSize != null)
        o.tiltToSize = Math.max(-1, Math.min(1, Number(values.tiltToSize)));
      if (values.tiltToFan != null)
        o.tiltToFan = Math.max(-1, Math.min(1, Number(values.tiltToFan)));
      if (values.tiltToGrainScale != null)
        o.tiltToGrainScale = Math.max(
          -1,
          Math.min(1, Number(values.tiltToGrainScale))
        );
      if (values.tiltToEdgeNoise != null)
        o.tiltToEdgeNoise = Math.max(
          -1,
          Math.min(1, Number(values.tiltToEdgeNoise))
        );

      /* -------- Edge noise (ink fringe / dry brush) -------- */
      if (values.edgeNoiseStrength != null)
        o.edgeNoiseStrength = Math.max(
          0,
          Math.min(1, Number(values.edgeNoiseStrength))
        );
      if (values.edgeNoiseScale != null)
        o.edgeNoiseScale = Math.max(
          2,
          Math.min(64, Number(values.edgeNoiseScale))
        );
      if (values.dryThreshold != null)
        o.dryThreshold = Math.max(0, Math.min(1, Number(values.dryThreshold)));

      /* -------- Pencil rim / lighting -------- */
      if (values.rimStrength != null)
        o.rimStrength = Math.max(0, Math.min(1, Number(values.rimStrength)));
      if (values.rimMode != null) {
        const idx = Math.max(
          0,
          Math.min(RIM_MODE_OPTS.length - 1, Number(values.rimMode))
        );
        o.rimMode = RIM_MODE_OPTS[idx];
      }
      if (values.bgIsLight != null) o.bgIsLight = !!values.bgIsLight;

      return o;
    }, [values]);

  // Derive preview brush size (stick to small range for thumbnail perf)
  const sizeParam = React.useMemo(
    () => preset.params.find((p) => p.type === "size"),
    [preset.params]
  );
  const baseSizePx = React.useMemo(() => {
    return Math.max(
      2,
      Math.min(
        28,
        ((values.size ?? sizeParam?.defaultValue ?? 12) as number) *
          (preset.engine.shape?.sizeScale ?? 1)
      )
    );
  }, [values.size, sizeParam?.defaultValue, preset.engine.shape?.sizeScale]);

  // Debounced preview renderer to avoid spamming draw calls on rapid slider changes
  const schedulePreview = React.useRef(
    debounce(
      (canvas: HTMLCanvasElement, opts: RenderOptions) => {
        void drawStrokeToCanvas(canvas, opts);
      },
      40, // ~1–2 frames of debounce for a smoother feel
      { trailing: true, leading: false, maxWait: 100 }
    )
  ).current;

  React.useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const opts: RenderOptions = {
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
    };

    schedulePreview(el, opts);
  }, [
    preset.engine,
    baseSizePx,
    overrides,
    values.hueJitter,
    values.satJitter,
    values.brightJitter,
    values.perStamp,
    schedulePreview,
  ]);

  React.useEffect(() => {
    // Cleanup debounced timer on unmount
    return () => {
      schedulePreview.cancel();
    };
  }, [schedulePreview]);

  return (
    <div className="space-y-2">
      {/* Preview strip */}
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

      {/* sm: dropdown + active panel */}
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
