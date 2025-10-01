// src/features/editor/EditorScreen.tsx
"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";

import type { TextLayer, BoxLayer, Step, CanvasBg } from "./types/layers";
import { useEditorStore } from "./store/editor.store";
import type Konva from "konva";
import { saveAs } from "file-saver";
import { toast } from "sonner";

// UI
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import StepHeader from "@/components/editor/StepHeader";
import PresetGallery from "@/components/editor/PresetGallery";
import FullEditorOverlay from "@/components/editor/FullEditorOverlay";

// Panels
import ZoomControls from "@features/editor/panels/ZoomControls";
import PromptOverlay from "@features/editor/panels/PromptOverlay";
import CanvasBackgroundToggle from "@features/editor/panels/CanvasBackgroundToggle";

// Data
import {
  PRESETS,
  PRESET_PLACEHOLDER,
  defaultPresetForProjectType,
  type Preset,
} from "@/data/presets";
import type { Preset as GalleryPreset } from "@/components/editor/PresetGallery";

// Hooks
import { useProject } from "./hooks/useProject";
import { useCanvasSizing } from "./hooks/useCanvasSizing";
import { useGeneration } from "./hooks/useGeneration";
import { usePrompt } from "./hooks/usePrompt";

// Icons
import {
  ArrowBigRight,
  ArrowBigLeft,
  Sparkles,
  PencilRuler,
} from "lucide-react";

// Canvas
import StageView, { type DrawPaint } from "@/ui/StageView";

// Perf HUD
import { ensureHudAttached, setPerfMetrics } from "@/lib/debug/hud";
import { usePerfHudToggle } from "@/lib/debug/usePerfHudToggle";

/* ------------------------------- constants -------------------------------- */
const DOCKED_TOP_PX = 12;
const PREVIEW_MAX_LONG_EDGE = 1600;
const ZOOM_MIN = 0.05;
const ZOOM_MAX = 3;

type DeviceBucket = "small" | "medium" | "large";
const deviceBucketFromWidth = (w: number): DeviceBucket =>
  w < 640 ? "small" : w < 1024 ? "medium" : "large";

const startingScaleFor = (
  preset: {
    starting_scale_small?: number;
    starting_scale_medium?: number;
    starting_scale_large?: number;
  },
  bucket: DeviceBucket
): number =>
  bucket === "small"
    ? preset.starting_scale_small ?? 1
    : bucket === "medium"
      ? preset.starting_scale_medium ?? 1
      : preset.starting_scale_large ?? 1;

const STEPS_LIST: Step[] = ["type", "edit", "variants", "qa", "export"];
const LABEL_MAP: Record<Step, string> = {
  type: "Type",
  edit: "Edit",
  variants: "Variants",
  qa: "Checks",
  export: "Export",
};

/* =============================== Component =============================== */

export default function EditorScreen({
  projectId,
}: {
  projectId: string;
}): React.ReactElement {
  // Perf HUD: attach once + hotkey (Cmd/Ctrl+Shift+H)
  usePerfHudToggle();
  useEffect(() => {
    ensureHudAttached();
  }, []);

  /* ------------------------------ Project data ----------------------------- */
  const { project, loading: isProjectLoading } = useProject(projectId);

  /* ----------------------------- Preset picker ----------------------------- */
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    PRESET_PLACEHOLDER.id
  );
  const selectedPreset = useMemo(
    () =>
      selectedPresetId ? getPresetById(selectedPresetId) : PRESET_PLACEHOLDER,
    [selectedPresetId]
  );

  // Destructure to keep deps small
  const {
    id: presetId,
    width: presetW,
    height: presetH,
    starting_scale_small,
    starting_scale_medium,
    starting_scale_large,
    label: presetLabel,
  } = selectedPreset;

  const galleryPresets: GalleryPreset[] = useMemo(
    () =>
      PRESETS.map((p) => ({
        id: p.id,
        label: p.label,
        width: p.width,
        height: p.height,
        company: p.platform ?? p.category ?? "Other",
      })),
    []
  );

  const hasUserSelectedPreset = selectedPresetId !== PRESET_PLACEHOLDER.id;

  useEffect(() => {
    if (!project) return;
    const def = defaultPresetForProjectType(project.type) as Preset;
    setSelectedPresetId(def.id);
  }, [project]);

  /* -------------------------------- Steps --------------------------------- */
  const [currentStep, setCurrentStep] = useState<Step>("type");
  const stepIndex = STEPS_LIST.indexOf(currentStep);
  const prevStep = stepIndex > 0 ? STEPS_LIST[stepIndex - 1] : null;
  const nextStep =
    stepIndex >= 0 && stepIndex + 1 < STEPS_LIST.length
      ? STEPS_LIST[stepIndex + 1]
      : null;

  const prettyStep = (s: Step) => LABEL_MAP[s] ?? s;
  const nextStepLabel = nextStep ? prettyStep(nextStep) : "";

  /* -------------------------------- Prompt -------------------------------- */
  const {
    promptText,
    setPromptText,
    isPromptFocused,
    setIsPromptFocused,
    promptTextareaRef,
    promptDocInputRef,
    autosize,
    dock,
  } = usePrompt();

  /* ---------------------------- Generator panel --------------------------- */
  const [showGenerator, setShowGenerator] = useState<boolean>(false);
  const [ctaDismissed, setCtaDismissed] = useState<boolean>(false);
  const [isFullEditorOpen, setIsFullEditorOpen] = useState(false);

  /* ---------------------------- Canvas + layers ---------------------------- */
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(
    null
  );
  const [imageScale, setImageScale] = useState<number>(1);
  const [imageOffsetX, setImageOffsetX] = useState<number>(0);
  const [imageOffsetY, setImageOffsetY] = useState<number>(0);
  const hasAnyArtwork = imageElement !== null;

  const [texts, setTexts] = useState<TextLayer[]>([]);
  const [boxes, setBoxes] = useState<BoxLayer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Keep refs for FullEditorOverlay compatibility (safe even if unused)
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const stageRef = useRef<Konva.Stage>(null);

  // Background & generator UI
  const [canvasBg, setCanvasBg] = useState<CanvasBg>("white");

  // Fit image to preset (stable)
  const fitImageToPreset = useCallback(
    (mode: "cover" | "contain" = "cover"): void => {
      if (!imageElement) return;
      const imgW = imageElement.naturalWidth || imageElement.width;
      const imgH = imageElement.naturalHeight || imageElement.height;
      const frameW = presetW;
      const frameH = presetH;
      if (!imgW || !imgH || !frameW || !frameH) return;

      const scaleX = frameW / imgW;
      const scaleY = frameH / imgH;
      const scale =
        mode === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);

      const newW = imgW * scale;
      const newH = imgH * scale;
      const offX = Math.round((frameW - newW) / 2);
      const offY = Math.round((frameH - newH) / 2);

      setImageScale(scale);
      setImageOffsetX(offX);
      setImageOffsetY(offY);
    },
    [imageElement, presetW, presetH]
  );

  // Refit on image change
  useEffect(() => {
    if (!imageElement) return;
    fitImageToPreset("cover");
  }, [imageElement, fitImageToPreset]);

  /* ----------------------------- Canvas sizing ---------------------------- */
  const { containerRef, fitToContainerScale, previewCapScale } =
    useCanvasSizing(presetW || 1, presetH || 1, PREVIEW_MAX_LONG_EDGE);

  /* --------------------------------- Zoom --------------------------------- */
  const zoom = useEditorStore((s) => s.viewport.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);

  useEffect(() => {
    const bucket =
      typeof window === "undefined"
        ? "large"
        : deviceBucketFromWidth(window.innerWidth);

    const next = startingScaleFor(
      {
        starting_scale_small,
        starting_scale_medium,
        starting_scale_large,
      },
      bucket
    );

    setZoom(next);
  }, [
    setZoom,
    presetId,
    starting_scale_small,
    starting_scale_medium,
    starting_scale_large,
  ]);

  const composedStageScale = useMemo<number>(() => {
    const base = Math.min(fitToContainerScale || 1, previewCapScale || 1);
    const clampedZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
    return base * clampedZoom;
  }, [fitToContainerScale, previewCapScale, zoom]);

  const stageWidthPx = Math.max(
    1,
    Math.floor((presetW || 1) * composedStageScale)
  );
  const stageHeightPx = Math.max(
    1,
    Math.floor((presetH || 1) * composedStageScale)
  );

  /* ------------------------------- Generation ------------------------------ */
  const { isGenerating, isImageLoading, generate } = useGeneration(projectId);

  const onImage = (_url: string, img: HTMLImageElement): void => {
    setImageElement(img);
    fitImageToPreset("cover");
  };

  async function handleGenerate(): Promise<void> {
    if (!promptText.trim()) return;
    dock();
    await generate({
      prompt: promptText,
      presetId,
      width: presetW,
      height: presetH,
      onImage,
    });
  }

  /* ------------------------------ drawPaint -------------------------------- */
  const dpr =
    typeof window !== "undefined"
      ? Math.min(window.devicePixelRatio || 1, 2)
      : 1;

  const drawPaint = useCallback<DrawPaint>(
    async (_canvas, ctxRaw) => {
      const t0 = performance.now();
      const ctx = ctxRaw as CanvasRenderingContext2D;

      // Background
      ctx.fillStyle = canvasBg === "white" ? "#fff" : "#000";
      ctx.fillRect(0, 0, presetW || 1, presetH || 1);

      // Background image
      if (imageElement) {
        ctx.save();
        ctx.translate(imageOffsetX, imageOffsetY);
        ctx.scale(imageScale, imageScale);
        ctx.drawImage(imageElement, 0, 0);
        ctx.restore();
      }

      // Boxes
      for (const b of boxes) {
        ctx.fillStyle = "#00000088";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2 / dpr;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
      }

      // Texts
      for (const t of texts) {
        ctx.fillStyle = "#ffffff";
        ctx.font = `${t.size}px sans-serif`;
        ctx.textBaseline = "top";
        ctx.fillText(t.text, t.x, t.y);
      }

      // Perf sample (very rough)
      const frameMs = performance.now() - t0;
      const stampsPerSec = frameMs > 0 ? Math.min(240, 1000 / frameMs) : null;
      setPerfMetrics({
        frameMs,
        stampsPerSec: stampsPerSec ?? undefined,
      });
    },
    [
      boxes,
      texts,
      imageElement,
      imageOffsetX,
      imageOffsetY,
      imageScale,
      canvasBg,
      presetW,
      presetH,
      dpr,
    ]
  );

  /* -------------------------------- Export -------------------------------- */
  async function exportPNG(): Promise<void> {
    // Render with the same drawPaint onto a temporary canvas at 1x
    const W = Math.max(1, presetW || 1);
    const H = Math.max(1, presetH || 1);
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    await drawPaint(canvas, ctx as unknown as CanvasRenderingContext2D);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const safeTitle = (project?.title ?? "asset").replace(/[^\w\-]+/g, "_");
      saveAs(blob, `${safeTitle}_${presetId}.png`);
    }, "image/png");
  }

  /* --------------------------- Step availability --------------------------- */
  const enabledSteps: Step[] = useMemo(() => {
    const enabled = new Set<Step>();
    enabled.add("type");
    if (hasUserSelectedPreset) enabled.add("edit");
    if (hasAnyArtwork) {
      enabled.add("variants");
      enabled.add("qa");
      enabled.add("export");
    }
    return STEPS_LIST.filter((s) => enabled.has(s));
  }, [hasUserSelectedPreset, hasAnyArtwork]);

  const canContinue: boolean =
    currentStep === "type"
      ? hasUserSelectedPreset
      : currentStep === "edit"
        ? hasAnyArtwork
        : currentStep === "export"
          ? false
          : true;

  function goBack(): void {
    if (!prevStep) return;
    setCurrentStep(prevStep);
  }
  function goForward(): void {
    if (!nextStep || !canContinue) return;
    if (currentStep === "type") {
      setCurrentStep("edit");
      return;
    }
    setCurrentStep(nextStep);
  }

  const isPromptDocked: boolean =
    currentStep === "edit" &&
    showGenerator &&
    hasAnyArtwork &&
    !isPromptFocused;

  const shouldBlurCanvas: boolean =
    currentStep === "edit" &&
    showGenerator &&
    (!hasAnyArtwork || !isPromptDocked);

  /* ------------------------------ File inputs ------------------------------ */
  const imageInputRef = useRef<HTMLInputElement>(null);
  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        setImageElement(img);
        fitImageToPreset("cover");
        toast.success("Image loaded");
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  /* ----------------------------- Keyboard edit ----------------------------- */
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (currentStep !== "edit" || !selectedId) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        setBoxes((b) => b.filter((x) => x.id !== selectedId));
        setTexts((t) => t.filter((x) => x.id !== selectedId));
        if (selectedId === "bg") setImageElement(null);
        setSelectedId(null);
        return;
      }
      const nudge = (dx = 0, dy = 0): void => {
        setBoxes((b) =>
          b.map((x) =>
            x.id === selectedId ? { ...x, x: x.x + dx, y: x.y + dy } : x
          )
        );
        setTexts((t) =>
          t.map((x) =>
            x.id === selectedId ? { ...x, x: x.x + dx, y: x.y + dy } : x
          )
        );
        if (selectedId === "bg") {
          setImageOffsetX((x) => x + dx);
          setImageOffsetY((y) => y + dy);
        }
      };
      if (e.key === "ArrowLeft") nudge(-1, 0);
      if (e.key === "ArrowRight") nudge(1, 0);
      if (e.key === "ArrowUp") nudge(0, -1);
      if (e.key === "ArrowDown") nudge(0, 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentStep, selectedId]);

  /* ------------------------------ Edit helpers ----------------------------- */
  function addTitleText(): void {
    const id = crypto.randomUUID();
    const W = presetW || 1;
    const H = presetH || 1;
    setTexts((t) => [
      ...t,
      {
        id,
        text: project?.title || "Title",
        x: Math.round(W * 0.1),
        y: Math.round(H * 0.1),
        size: Math.round(H * 0.12),
      },
    ]);
    setSelectedId(id);
  }

  /* --------------------------------- Render -------------------------------- */
  if (isProjectLoading) return <div className="p-6">Loading…</div>;
  if (!project) return <div className="p-6">Project not found.</div>;

  const showCtaOverlay =
    currentStep === "edit" && !showGenerator && !isFullEditorOpen;
  const dockCta = ctaDismissed || hasAnyArtwork;

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden"
      data-project-id={projectId}
    >
      {/* HEADER */}
      <div className="relative z-30 h-10 shrink-0 flex items-center px-4 w-full">
        <StepHeader
          step={currentStep}
          steps={STEPS_LIST}
          enabled={enabledSteps}
          onChangeAction={setCurrentStep}
          labels={{ qa: "Checks" }}
        />
      </div>

      {/* CONTENT AREA */}
      <div className="relative flex-1 min-h-0 min-w-0 p-4 pt-2">
        {/* Back/Next rail */}
        {currentStep !== "type" && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 w-[min(100%,80rem)] px-4 pointer-events-none">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center pointer-events-auto">
              <div className="justify-self-start">
                {prevStep && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={goBack}
                    className="group rounded-full h-6 sm:h-8 w-10 px-2 cursor-pointer"
                    title={`Back to ${prettyStep(prevStep)}`}
                  >
                    <ArrowBigLeft className="h-4 w-4 shrink-0" />
                  </Button>
                )}
              </div>
              <div />
              <div className="justify-self-end">
                {currentStep !== "export" && canContinue && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={goForward}
                    className="group rounded-full transition-all duration-300 flex items-center overflow-hidden h-8 cursor-pointer px-2"
                    title={`Continue to ${nextStepLabel}`}
                  >
                    <ArrowBigRight className="h-4 w-4 shrink-0" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TYPE STEP */}
        {currentStep === "type" && (
          <div className="absolute inset-0 z-20 pointer-events-none">
            <div
              className="absolute left-1/2 w-[min(100%,80rem)] px-4 transition-all duration-300 ease-out pointer-events-auto"
              style={{
                willChange: "transform, top",
                top: DOCKED_TOP_PX,
                transform: hasUserSelectedPreset
                  ? "translate(-50%, 0) scale(0.92)"
                  : "translate(-50%, 0) scale(1)",
              }}
            >
              <div className="relative mx-auto transition-all duration-300 ease-out w-full">
                {!hasUserSelectedPreset ? (
                  <Card className="mt-3 h-[75vh] mb-12 border bg-card shadow-md px-4 py-3">
                    <div className="flex w-full flex-col gap-2 ">
                      <div className="text-xs text-muted-foreground text-center font-bold">
                        Choose a size/type to preview the canvas.
                      </div>
                      <div className="mx-auto w-full ">
                        <div className="max-w-7xl mx-auto h:[min(66vh,720px)]">
                          <PresetGallery
                            presets={galleryPresets}
                            value={
                              hasUserSelectedPreset ? selectedPresetId : null
                            }
                            onChangeAction={(id) => setSelectedPresetId(id)}
                            projectType={project.type}
                            showFilters
                          />
                        </div>
                      </div>
                    </div>
                  </Card>
                ) : (
                  <div className="flex items-center justify-between w-full">
                    <div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setSelectedPresetId(PRESET_PLACEHOLDER.id)
                        }
                        className="text-xs sm:text-sm rounded-full h-8 mt-1 cursor-pointer"
                        title="Change type (back to gallery)"
                      >
                        Change type
                      </Button>
                    </div>
                    <div className="justify-self-start ml-1 mt-2 text-xs sm:text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {presetLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setCurrentStep("edit")}
                        className="text-xs sm:text-sm rounded-full h-8 cursor-pointer px-2"
                        title="Go to editor"
                      >
                        Continue to Edit
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* GENERATOR PANEL (Edit step) */}
        {currentStep === "edit" && showGenerator && !isFullEditorOpen && (
          <PromptOverlay
            isPromptDocked={!!(hasAnyArtwork && !isPromptFocused)}
            promptText={promptText}
            isGenerating={isGenerating}
            attachedPromptDocName={null}
            onGenerate={handleGenerate}
            onChangePrompt={() => {
              setIsPromptFocused(true);
              setTimeout(() => {
                promptTextareaRef.current?.focus();
                autosize();
              }, 0);
            }}
            onAttachClick={() => promptDocInputRef.current?.click()}
            onPromptFocus={() => {
              setIsPromptFocused(true);
              setTimeout(() => autosize(), 0);
            }}
            onPromptBlur={() =>
              setTimeout(() => setIsPromptFocused(false), 120)
            }
            onPromptChange={(v) => setPromptText(v)}
            promptTextareaRef={promptTextareaRef}
            promptDocInputRef={promptDocInputRef}
            autosize={() => autosize()}
            dockTopPx={hasAnyArtwork ? DOCKED_TOP_PX : 24}
          />
        )}

        {/* 🟣 FLOATING GENERATE CTA */}
        {showCtaOverlay && (
          <div className="absolute inset-0 z-20 pointer-events-none">
            <div
              className="absolute left-1/2 w-[min(100%,80rem)] px-4 transition-all duration-300 ease-out pointer-events-none"
              style={{
                willChange: "transform, top",
                top: dockCta ? DOCKED_TOP_PX : "50%",
                transform: dockCta
                  ? "translate(-50%, 0) scale(0.95)"
                  : "translate(-50%, -50%) scale(1)",
              }}
            >
              <div
                className={`mx-auto ${
                  dockCta ? "max-w-[28rem]" : "max-w-[40rem]"
                }`}
              >
                <div
                  className={`flex ${
                    dockCta ? "justify-end" : "justify-center"
                  } pointer-events-auto`}
                >
                  <div className="flex items-center gap-2 rounded-2xl border bg-background/90 backdrop-blur shadow-md px-3 py-2 transition-all duration-300">
                    <Button
                      size="sm"
                      variant={dockCta ? "secondary" : "default"}
                      onClick={() => setShowGenerator(true)}
                      className="rounded-full cursor-pointer text-xs"
                      title="Generate an image"
                    >
                      <Sparkles className="h-2 w-2 mr-1" />
                      Generate
                    </Button>

                    {!dockCta && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          addTitleText();
                          setCtaDismissed(true);
                          setIsFullEditorOpen(true);
                        }}
                        className="rounded-full cursor-pointer text-xs"
                        title="Start manual on a blank canvas"
                      >
                        <PencilRuler className="h-2 w-2 mr-1" />
                        Create
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CANVAS (main, non-fullscreen) */}
        <div className="mt-2 absolute inset-0 pt-16 md:pt-14">
          <div
            className={[
              "relative h-full w-full min-h-0 min-w-0 transition-all duration-300",
              shouldBlurCanvas ? "blur-[10px] opacity-60" : "",
            ].join(" ")}
          >
            {/* Canvas controls */}
            <CanvasBackgroundToggle
              value={canvasBg}
              onChangeAction={setCanvasBg}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-[200]"
            />
            <ZoomControls
              attach="container"
              className="absolute left-0 top-1/2 -translate-y-1/2 z-[200]"
            />

            {/* StageView (Konva is encapsulated) */}
            <div
              ref={containerRef}
              className="flex h-full w-full min-h-0 min-w-0 items-center justify-center"
            >
              <div className="max-h-full max-w-full">
                {(isGenerating || isImageLoading) &&
                currentStep === "edit" &&
                showGenerator ? (
                  <div
                    className="inline-block rounded-sm border shadow-sm animate-pulse bg-muted/30"
                    style={{
                      width: Math.max(stageWidthPx, 240),
                      height: Math.max(stageHeightPx, 160),
                      lineHeight: 0,
                    }}
                  >
                    <div className="h-full w-full p-4">
                      <div className="h-full w-full rounded bg-muted/50" />
                    </div>
                  </div>
                ) : (
                  <div
                    className="inline-block border rounded-sm shadow-sm bg-neutral-900"
                    style={{
                      lineHeight: 0,
                      width: stageWidthPx,
                      height: stageHeightPx,
                    }}
                  >
                    <StageView
                      width={presetW || 1}
                      height={presetH || 1}
                      dpr={dpr}
                      zoom={composedStageScale}
                      pan={{ x: 0, y: 0 }}
                      drawPaintAction={drawPaint}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Hidden image input (shared) */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageChange}
        />

        {/* Full-screen overlay (manual editing) */}
        <FullEditorOverlay
          open={isFullEditorOpen}
          onClose={(): void => setIsFullEditorOpen(false)}
          onAiVariant={(): void => {
            setIsFullEditorOpen(false);
            setCtaDismissed(true);
            setShowGenerator(true);
          }}
          preset={selectedPreset}
          imageElement={imageElement}
          imageScale={imageScale}
          imageOffsetX={imageOffsetX}
          imageOffsetY={imageOffsetY}
          setImageOffsetX={setImageOffsetX}
          setImageOffsetY={setImageOffsetY}
          texts={texts}
          setTexts={setTexts}
          boxes={boxes}
          setBoxes={setBoxes}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          stageRef={stageRef}
          transformerRef={transformerRef}
          canvasBg={canvasBg}
        />

        {/* Bottom bar (Export on final step) */}
        <div className="absolute bottom-2 inset-x-3 flex items-center justify-between text-xs text-muted-foreground">
          <div className="truncate">{hasUserSelectedPreset && <br />}</div>
          <div className="flex items-center gap-2 mb-4">
            {currentStep === "export" && hasAnyArtwork && (
              <Button size="sm" onClick={exportPNG}>
                Export PNG
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- utilities -------------------------------- */

function getPresetById(id: string): Preset {
  if (id === PRESET_PLACEHOLDER.id) return PRESET_PLACEHOLDER;
  const found = (PRESETS as Preset[]).find((p) => p.id === id);
  return found ?? (PRESETS as Preset[])[0];
}
