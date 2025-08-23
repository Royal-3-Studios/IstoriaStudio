// src/app/projects/[projectId]/editor/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import type Konva from "konva";
import { saveAs } from "file-saver";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import StepHeader, { type Step } from "@/components/editor/StepHeader";
import PresetGallery from "@/components/editor/PresetGallery";

import FullEditorOverlay from "@/components/editor/FullEditorOverlay";

import {
  PRESETS,
  PRESET_PLACEHOLDER,
  defaultPresetForProjectType,
  type Preset,
} from "@/data/presets";
import type { Preset as GalleryPreset } from "@/components/editor/PresetGallery";

import { useProject } from "./hooks/useProject";
import { useCanvasSizing } from "./hooks/useCanvasSizing";
import { useGeneration } from "./hooks/useGeneration";
import { usePrompt } from "./hooks/usePrompt";

import {
  Loader,
  Plus as PlusIcon,
  Paperclip,
  ArrowBigRight,
  ArrowBigLeft,
  X as CloseIcon,
  Sparkles,
  Upload as UploadIcon,
  Type as TypeIcon,
  Square as SquareIcon,
  PencilRuler,
  LogOut as ExitIcon,
  Wand2 as MagicIcon,
} from "lucide-react";

// ---------- helpers ----------
type DeviceBucket = "small" | "medium" | "large";

function deviceBucketFromWidth(w: number): DeviceBucket {
  if (w < 640) return "small"; // phones
  if (w < 1024) return "medium"; // tablets / small laptops
  return "large"; // desktops
}

function startingScaleFor(
  preset: {
    starting_scale_small?: number;
    starting_scale_medium?: number;
    starting_scale_large?: number;
  },
  bucket: DeviceBucket
) {
  if (bucket === "small") return preset.starting_scale_small ?? 1;
  if (bucket === "medium") return preset.starting_scale_medium ?? 1;
  return preset.starting_scale_large ?? 1;
}

const DOCKED_TOP_PX = 12;
const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));
const PREVIEW_MAX_LONG_EDGE = 1600;

const getPresetById = (id: string): Preset =>
  id === PRESET_PLACEHOLDER.id
    ? PRESET_PLACEHOLDER
    : (PRESETS as Preset[]).find((p) => p.id === id) ??
      (PRESETS as Preset[])[0];

// ---------- Konva (client-only) ----------
const Stage = dynamic(
  () => import("@/components/konva/StageClient").then((m) => m.default),
  { ssr: false }
);
const Layer = dynamic(
  () => import("@/components/konva/LayerClient").then((m) => m.default),
  { ssr: false }
);
const KonvaImage = dynamic(
  () => import("@/components/konva/ImageClient").then((m) => m.default),
  { ssr: false }
);
const KonvaText = dynamic(
  () => import("@/components/konva/TextClient").then((m) => m.default),
  { ssr: false }
);
const Rect = dynamic(
  () => import("@/components/konva/RectClient").then((m) => m.default),
  { ssr: false }
);

// ✅ Use your wrapper (avoids invalid element issues)
import Transformer from "@/components/konva/TransformerClient";

// ---------- Component ----------
export default function Page() {
  const { projectId } = useParams<{ projectId: string }>();

  // Project
  const { project, loading: isProjectLoading } = useProject(projectId);

  // Preset selection
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    PRESET_PLACEHOLDER.id
  );
  const selectedPreset = useMemo(
    () => getPresetById(selectedPresetId),
    [selectedPresetId]
  );

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

  // Seed default preset when project loads
  useEffect(() => {
    if (!project) return;
    const def = defaultPresetForProjectType(project.type) as Preset;
    setSelectedPresetId(def.id);
  }, [project]);

  // Steps: no Base — Edit hosts AI generation
  const stepsList: Step[] = ["type", "edit", "variants", "qa", "export"];
  const [currentStep, setCurrentStep] = useState<Step>("type");
  const stepIndex = stepsList.indexOf(currentStep);
  const prevStep = stepIndex > 0 ? stepsList[stepIndex - 1] : null;
  const nextStep =
    stepIndex >= 0 && stepIndex + 1 < stepsList.length
      ? stepsList[stepIndex + 1]
      : null;

  const labelMap: Record<Step, string> = {
    type: "Type",
    edit: "Edit",
    variants: "Variants",
    qa: "Checks",
    export: "Export",
  };
  const prettyStep = (s: Step) =>
    labelMap[s] ?? s[0].toUpperCase() + s.slice(1);
  const nextStepLabel = nextStep ? prettyStep(nextStep) : "";

  // Prompt (for generator panel)
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

  // Generator panel visibility (lives in Edit)
  const [showGenerator, setShowGenerator] = useState<boolean>(false);

  // Floating CTA dismissed? (when user chooses manual)
  const [ctaDismissed, setCtaDismissed] = useState<boolean>(false);

  const [isFullEditorOpen, setIsFullEditorOpen] = useState(false);

  // Image element & transform
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(
    null
  );
  const [imageScale, setImageScale] = useState<number>(1);
  const [imageOffsetX, setImageOffsetX] = useState<number>(0);
  const [imageOffsetY, setImageOffsetY] = useState<number>(0);
  const hasAnyArtwork = !!imageElement;

  // Edit layers & selection
  type TextLayer = {
    id: string;
    text: string;
    x: number;
    y: number;
    size: number;
  };
  type BoxLayer = { id: string; x: number; y: number; w: number; h: number };

  const [texts, setTexts] = useState<TextLayer[]>([]);
  const [boxes, setBoxes] = useState<BoxLayer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const stageRef = useRef<Konva.Stage>(null);

  // Fit image to preset
  function fitImageToPreset(mode: "cover" | "contain" = "cover") {
    if (!imageElement) return;
    const imgW = imageElement.naturalWidth || imageElement.width;
    const imgH = imageElement.naturalHeight || imageElement.height;
    const frameW = selectedPreset.width;
    const frameH = selectedPreset.height;
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
  }

  // Refit on image/preset change
  useEffect(() => {
    if (!imageElement) return;
    fitImageToPreset("cover");
  }, [imageElement, selectedPreset.width, selectedPreset.height]);

  // Attach Transformer to selected node
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;

    if (!selectedId) {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
      return;
    }

    const node = stageRef.current.findOne(`#${selectedId}`);
    if (node) {
      transformerRef.current.nodes([node]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedId]);

  // Canvas sizing (main view)
  const { containerRef, fitToContainerScale, previewCapScale } =
    useCanvasSizing(
      selectedPreset.width || 1,
      selectedPreset.height || 1,
      PREVIEW_MAX_LONG_EDGE
    );

  // Zoom (init from preset/device bucket)
  const ZOOM_MIN = 0.05;
  const ZOOM_MAX = 3;
  const [zoomPercent, setZoomPercent] = useState<number>(() => {
    const bucket =
      typeof window === "undefined"
        ? "large"
        : deviceBucketFromWidth(window.innerWidth);
    return startingScaleFor(selectedPreset, bucket);
  });
  useEffect(() => {
    const bucket = deviceBucketFromWidth(window.innerWidth);
    setZoomPercent(startingScaleFor(selectedPreset, bucket));
  }, [selectedPreset.id, selectedPreset.width, selectedPreset.height]);

  const composedStageScale = useMemo(() => {
    const base = Math.min(fitToContainerScale || 1, previewCapScale || 1);
    const z = clamp(zoomPercent, ZOOM_MIN, ZOOM_MAX);
    return base * z;
  }, [fitToContainerScale, previewCapScale, zoomPercent]);

  // Stage pixel size (main view)
  const stageWidthPx = Math.max(
    1,
    Math.floor((selectedPreset.width || 1) * composedStageScale)
  );
  const stageHeightPx = Math.max(
    1,
    Math.floor((selectedPreset.height || 1) * composedStageScale)
  );

  // Generation (AI)
  const { isGenerating, isImageLoading, generate } = useGeneration(projectId);
  const onImage = (_url: string, img: HTMLImageElement) => {
    setImageElement(img);
    fitImageToPreset("cover");
  };

  async function handleGenerate() {
    if (!promptText.trim()) return;
    dock();
    await generate({
      prompt: promptText,
      presetId: selectedPreset.id,
      width: selectedPreset.width,
      height: selectedPreset.height,
      onImage,
    });
  }

  // Export
  async function exportPNG() {
    if (!stageRef.current) return;
    const dataURL = stageRef.current.toDataURL({
      mimeType: "image/png",
      pixelRatio: 1 / Math.max(composedStageScale, 0.001),
    });
    const safeTitle = (project?.title ?? "asset").replace(/[^\w\-]+/g, "_");
    const blob = await (await fetch(dataURL)).blob();
    saveAs(blob, `${safeTitle}_${selectedPreset.id}.png`);
  }

  // Step enabling
  const enabledSteps: Step[] = useMemo(() => {
    const enabled = new Set<Step>();
    enabled.add("type");
    if (hasUserSelectedPreset) enabled.add("edit"); // manual editing allowed on blank canvas
    if (hasAnyArtwork) {
      enabled.add("variants");
      enabled.add("qa");
      enabled.add("export");
    }
    return stepsList.filter((s) => enabled.has(s));
  }, [hasUserSelectedPreset, hasAnyArtwork]); // stepsList is static

  const canContinue =
    currentStep === "type"
      ? hasUserSelectedPreset
      : currentStep === "edit"
        ? hasAnyArtwork // require artwork to advance to variants
        : currentStep === "export"
          ? false
          : true;

  function goBack() {
    if (!prevStep) return;
    setCurrentStep(prevStep);
  }
  function goForward() {
    if (!nextStep || !canContinue) return;

    // Leaving Type: go to Edit
    if (currentStep === "type") {
      setCurrentStep("edit");
      return;
    }
    setCurrentStep(nextStep);
  }

  // Canvas background
  const [canvasBg] = useState<"white" | "black">("white");

  // Blur rule: blur when generator is centered or before first asset
  const isPromptDocked =
    currentStep === "edit" &&
    showGenerator &&
    hasAnyArtwork &&
    !isPromptFocused;
  const shouldBlurCanvas =
    currentStep === "edit" &&
    showGenerator &&
    (!hasAnyArtwork || !isPromptDocked);

  // Hidden file inputs
  const imageInputRef = useRef<HTMLInputElement>(null);
  function openImagePicker() {
    imageInputRef.current?.click();
  }
  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
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

  // Keyboard: delete & nudge (Edit step)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (currentStep !== "edit" || !selectedId) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        setBoxes((b) => b.filter((x) => x.id !== selectedId));
        setTexts((t) => t.filter((x) => x.id !== selectedId));
        if (selectedId === "bg") {
          setImageElement(null);
        }
        setSelectedId(null);
        return;
      }

      const nudge = (dx = 0, dy = 0) => {
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

  // Edit helpers
  function addTitleText() {
    const id = crypto.randomUUID();
    const W = selectedPreset.width || 1;
    const H = selectedPreset.height || 1;

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

  function addRect() {
    const id = crypto.randomUUID();
    const W = selectedPreset.width || 1;
    const H = selectedPreset.height || 1;

    setBoxes((b) => [
      ...b,
      {
        id,
        x: Math.round(W * 0.1),
        y: Math.round(H * 0.7),
        w: Math.round(W * 0.8),
        h: Math.round(H * 0.12),
      },
    ]);
    setSelectedId(id);
  }

  // --- Floating Generate CTA logic ---
  const showCtaOverlay =
    currentStep === "edit" && !showGenerator && !isFullEditorOpen;
  const dockCta = ctaDismissed || hasAnyArtwork;

  // Render
  if (isProjectLoading) return <div className="p-6">Loading…</div>;
  if (!project) return <div className="p-6">Project not found.</div>;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* HEADER */}
      <div className="relative z-30 h-10 shrink-0 flex items-center px-4 w-full">
        <StepHeader
          step={currentStep}
          steps={stepsList}
          enabled={enabledSteps}
          onChangeAction={setCurrentStep}
          labels={{ qa: "Checks" }}
        />
      </div>

      {/* CONTENT AREA */}
      <div className="relative flex-1 min-h-0 min-w-0 p-4 pt-2">
        {/* Top rail: back/next */}
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
                        <div className="max-w-7xl mx-auto h-[min(66vh,720px)]">
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
                        {selectedPreset.label}
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
          <div className="absolute inset-0 z-20 pointer-events-none">
            <div
              className="absolute left-1/2 w-[min(100%,80rem)] px-4 transition-all duration-300 ease-out pointer-events-auto"
              style={{
                willChange: "transform, top",
                top: hasAnyArtwork ? DOCKED_TOP_PX : "25%",
                transform: hasAnyArtwork
                  ? "translate(-50%, 0) scale(1)"
                  : "translate(-50%, 0) scale(0.98)",
              }}
            >
              <div
                className={[
                  "relative mx-auto transition-all duration-300 ease-out",
                  hasAnyArtwork && !isPromptFocused ? "max-w-md" : "max-w-3xl",
                ].join(" ")}
              >
                {/* hidden inputs */}
                <input
                  ref={promptDocInputRef}
                  type="file"
                  accept=".txt,text/plain"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    setPromptText(text.trim());
                    setTimeout(() => autosize(), 0);
                  }}
                />
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageChange}
                />

                <Card
                  className={[
                    "relative transition-all duration-300 ease-out border bg-card shadow-md",
                    hasAnyArtwork && !isPromptFocused
                      ? "h-10 p-0 overflow-hidden rounded-2xl"
                      : "",
                  ].join(" ")}
                >
                  {hasAnyArtwork && !isPromptFocused ? (
                    // Docked toolbar
                    <div className="h-10 px-2 sm:px-3 flex items-center justify-between">
                      <div className="truncate text-[10px] sm:text-xs opacity-60">
                        Ready to tweak your image?
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-6 sm:h-8 px-2 sm:px-3 text-[10px] sm:text-xs rounded-full cursor-pointer"
                          onClick={handleGenerate}
                          disabled={isGenerating || !promptText.trim()}
                          title="Regenerate with current prompt"
                          aria-label="Regenerate"
                        >
                          {isGenerating ? (
                            <>
                              <Loader className="h-4 w-4 animate-spin" />
                              <span className="ml-1.5 hidden sm:inline">
                                Generating…
                              </span>
                            </>
                          ) : (
                            <>
                              <PlusIcon className="h-4 w-4" />
                              <span className="ml-1.5 hidden sm:inline">
                                Regenerate
                              </span>
                            </>
                          )}
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 sm:h-8 px-2 sm:px-3 text-[10px] sm:text-xs rounded-full cursor-pointer"
                          onClick={() => {
                            setIsPromptFocused(true);
                            setTimeout(() => {
                              promptTextareaRef.current?.focus();
                              autosize();
                            }, 0);
                          }}
                          title="Change prompt"
                          aria-label="Change prompt"
                        >
                          Change prompt
                        </Button>

                        {/* NEW: open full-screen editor */}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 sm:h-8 px-2 sm:px-3 text-[10px] sm:text-xs rounded-full cursor-pointer"
                          onClick={() => {
                            setShowGenerator(false);
                            setIsFullEditorOpen(true);
                          }}
                          title="Open full editor"
                          aria-label="Open full editor"
                        >
                          Edit
                        </Button>

                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => setShowGenerator(false)}
                          aria-label="Hide generator"
                          title="Hide"
                        >
                          <CloseIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // Centered editor
                    <>
                      <textarea
                        ref={promptTextareaRef}
                        className={[
                          "w-full bg-transparent border-none outline-none resize-none focus:overflow-y-auto",
                          "rounded-2xl pl-5 pr-24",
                          "text-base min-h-[7rem] mb-4",
                          "placeholder:text-muted-foreground",
                          "focus:ring-0 focus:outline-none",
                          "whitespace-pre-wrap break-words overflow-hidden",
                          "transition-all duration-300",
                        ].join(" ")}
                        placeholder="Describe what to generate…"
                        value={promptText}
                        onFocus={() => {
                          setIsPromptFocused(true);
                          setTimeout(() => autosize(), 0);
                        }}
                        onBlur={() =>
                          setTimeout(() => setIsPromptFocused(false), 120)
                        }
                        onChange={(event) => setPromptText(event.target.value)}
                        onInput={() => autosize()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            handleGenerate();
                          }
                        }}
                        rows={4}
                      />

                      {/* Attach + Actions */}
                      <button
                        type="button"
                        onClick={() => promptDocInputRef.current?.click()}
                        className="absolute left-3 bottom-2 inline-flex items-center gap-1 text-xs rounded-full px-2 py-1 border hover:bg-background hover:scale-110 bg-accent/40 transition"
                        title="Upload prompt (.txt)"
                        aria-label="Upload prompt"
                      >
                        <Paperclip className="h-3 w-3" />
                        Attach
                      </button>

                      <div className="absolute right-3 bottom-2">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            className="h-6 sm:h-8 rounded-full text-xs sm:text-sm cursor-pointer"
                            onClick={openImagePicker}
                            variant="outline"
                          >
                            Upload image
                          </Button>
                          <Button
                            type="button"
                            className="h-6 sm:h-8 rounded-full text-xs sm:text-sm cursor-pointer"
                            onClick={handleGenerate}
                            disabled={isGenerating || !promptText.trim()}
                            title="Generate"
                          >
                            {isGenerating ? (
                              <>
                                <Loader className="h-4 w-4 animate-spin" />
                                <span className="ml-1.5 hidden sm:inline">
                                  Generating…
                                </span>
                              </>
                            ) : (
                              <>
                                <PlusIcon className="h-4 w-4" />
                                <span className="ml-1.5 hidden sm:inline">
                                  Generate
                                </span>
                              </>
                            )}
                          </Button>
                          <Button
                            type="button"
                            className="h-6 sm:h-8 rounded-full text-xs sm:text-sm cursor-pointer"
                            variant="ghost"
                            onClick={() => setShowGenerator(false)}
                            title="Close"
                          >
                            Close
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* 🟣 FLOATING GENERATE CTA (center → docks to top) */}
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
                className={`mx-auto ${dockCta ? "max-w-[28rem]" : "max-w-[40rem]"}`}
              >
                <div
                  className={`flex ${dockCta ? "justify-end" : "justify-center"} pointer-events-auto`}
                >
                  <div
                    className={[
                      "flex items-center gap-2 rounded-2xl border bg-background/90 backdrop-blur shadow-md px-3 py-2",
                      "transition-all duration-300",
                    ].join(" ")}
                  >
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
                          setIsFullEditorOpen(true); // ← enter full-screen editor
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
                    style={{ lineHeight: 0 }}
                  >
                    <Stage
                      width={stageWidthPx}
                      height={stageHeightPx}
                      ref={stageRef}
                      onMouseDown={(e) => {
                        if (e.target === e.target.getStage())
                          setSelectedId(null);
                      }}
                      onTap={(e) => {
                        if (e.target === e.target.getStage())
                          setSelectedId(null);
                      }}
                    >
                      <Layer
                        scaleX={composedStageScale}
                        scaleY={composedStageScale}
                      >
                        {/* Canvas frame */}
                        <Rect
                          x={0}
                          y={0}
                          width={selectedPreset.width || 1}
                          height={selectedPreset.height || 1}
                          fill={canvasBg === "white" ? "#fff" : "#000"}
                          listening={false}
                        />

                        {/* Background image */}
                        {imageElement && (
                          <KonvaImage
                            id="bg"
                            image={imageElement}
                            x={imageOffsetX}
                            y={imageOffsetY}
                            scaleX={imageScale}
                            scaleY={imageScale}
                            draggable={currentStep === "edit"}
                            onClick={() =>
                              currentStep === "edit" && setSelectedId("bg")
                            }
                            onTap={() =>
                              currentStep === "edit" && setSelectedId("bg")
                            }
                            onDragEnd={(e) => {
                              setImageOffsetX(e.target.x());
                              setImageOffsetY(e.target.y());
                            }}
                          />
                        )}

                        {/* Boxes */}
                        {boxes.map((b) => (
                          <Rect
                            key={b.id}
                            id={b.id}
                            x={b.x}
                            y={b.y}
                            width={b.w}
                            height={b.h}
                            fill="#00000088"
                            stroke="#ffffff"
                            strokeWidth={2}
                            draggable={currentStep === "edit"}
                            onClick={() => setSelectedId(b.id)}
                            onTap={() => setSelectedId(b.id)}
                            onDragEnd={(e) => {
                              const { x, y } = e.target.position();
                              setBoxes((arr) =>
                                arr.map((it) =>
                                  it.id === b.id ? { ...it, x, y } : it
                                )
                              );
                            }}
                            onTransformEnd={(e) => {
                              const node = e.target;
                              const scaleX = node.scaleX();
                              const scaleY = node.scaleY();
                              node.scaleX(1);
                              node.scaleY(1);
                              const next = {
                                x: node.x(),
                                y: node.y(),
                                w: Math.max(2, b.w * scaleX),
                                h: Math.max(2, b.h * scaleY),
                              };
                              setBoxes((arr) =>
                                arr.map((it) =>
                                  it.id === b.id ? { ...it, ...next } : it
                                )
                              );
                            }}
                          />
                        ))}

                        {/* Texts */}
                        {texts.map((t) => (
                          <KonvaText
                            key={t.id}
                            id={t.id}
                            text={t.text}
                            fill="#ffffff"
                            fontSize={t.size}
                            x={t.x}
                            y={t.y}
                            draggable={currentStep === "edit"}
                            onClick={() => setSelectedId(t.id)}
                            onTap={() => setSelectedId(t.id)}
                            onDragEnd={(e) => {
                              const { x, y } = e.target.position();
                              setTexts((arr) =>
                                arr.map((it) =>
                                  it.id === t.id ? { ...it, x, y } : it
                                )
                              );
                            }}
                            onTransformEnd={(e) => {
                              const node = e.target;
                              const scaleY = node.scaleY();
                              node.scaleY(1);
                              const nextSize = Math.max(
                                4,
                                Math.round(t.size * scaleY)
                              );
                              setTexts((arr) =>
                                arr.map((it) =>
                                  it.id === t.id
                                    ? { ...it, size: nextSize }
                                    : it
                                )
                              );
                            }}
                          />
                        ))}

                        {/* Transformer (Edit only) */}
                        {currentStep === "edit" && (
                          <Transformer
                            ref={transformerRef}
                            rotateEnabled
                            keepRatio
                          />
                        )}
                      </Layer>
                    </Stage>
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

        <FullEditorOverlay
          open={isFullEditorOpen}
          onClose={() => setIsFullEditorOpen(false)}
          onAiVariant={() => {
            setIsFullEditorOpen(false);
            setCtaDismissed(true);
            setShowGenerator(true);
            // later: snapshot current as a variant
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

        {/* BOTTOM BAR */}
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

/** ---------------- Full-screen canvas ----------------
 * Separate subcomponent to keep the overlay tidy.
 * It reuses the same stageRef/transformerRef and layer state.
 */
function FullScreenCanvas({
  preset,
  imageElement,
  imageScale,
  imageOffsetX,
  imageOffsetY,
  setImageOffsetX,
  setImageOffsetY,
  texts,
  setTexts,
  boxes,
  setBoxes,
  selectedId,
  setSelectedId,
  stageRef,
  transformerRef,
  canvasBg,
}: {
  preset: Preset;
  imageElement: HTMLImageElement | null;
  imageScale: number;
  imageOffsetX: number;
  imageOffsetY: number;
  setImageOffsetX: (v: number | ((x: number) => number)) => void;
  setImageOffsetY: (v: number | ((y: number) => number)) => void;
  texts: { id: string; text: string; x: number; y: number; size: number }[];
  setTexts: React.Dispatch<
    React.SetStateAction<
      { id: string; text: string; x: number; y: number; size: number }[]
    >
  >;
  boxes: { id: string; x: number; y: number; w: number; h: number }[];
  setBoxes: React.Dispatch<
    React.SetStateAction<
      { id: string; x: number; y: number; w: number; h: number }[]
    >
  >;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  stageRef: React.MutableRefObject<Konva.Stage | null>;
  transformerRef: React.MutableRefObject<Konva.Transformer | null>;
  canvasBg: "white" | "black";
}) {
  // Fit-to-viewport scaling just for the overlay
  const { containerRef, fitToContainerScale } = useCanvasSizing(
    preset.width || 1,
    preset.height || 1,
    4096 // allow larger previews in full-screen
  );

  const stageScale = fitToContainerScale || 1;
  const stageWidth = Math.max(1, Math.floor((preset.width || 1) * stageScale));
  const stageHeight = Math.max(
    1,
    Math.floor((preset.height || 1) * stageScale)
  );

  // Keep transformer synced in overlay too
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;

    if (!selectedId) {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
      return;
    }
    const node = stageRef.current.findOne(`#${selectedId}`);
    if (node) {
      transformerRef.current.nodes([node]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedId, stageRef, transformerRef]);

  return (
    <div className="absolute inset-0">
      {/* left tools (basic) */}
      <div className="absolute left-4 top-16 z-10 flex flex-col gap-2">
        <span className="px-2 py-1 text-[10px] rounded bg-muted border">
          Manual tools
        </span>
        {/* You can add more tools here later; keeping lean for now */}
      </div>

      <div
        ref={containerRef}
        className="absolute inset-0 flex items-center justify-center p-4"
        style={{ paddingTop: 20 }}
      >
        <div className="max-h-full max-w-full">
          <div
            className="inline-block border rounded-sm shadow-sm bg-neutral-900"
            style={{ lineHeight: 0 }}
          >
            <Stage
              width={stageWidth}
              height={stageHeight}
              ref={stageRef}
              onMouseDown={(e) => {
                if (e.target === e.target.getStage()) setSelectedId(null);
              }}
              onTap={(e) => {
                if (e.target === e.target.getStage()) setSelectedId(null);
              }}
            >
              <Layer scaleX={stageScale} scaleY={stageScale}>
                {/* Canvas frame */}
                <Rect
                  x={0}
                  y={0}
                  width={preset.width || 1}
                  height={preset.height || 1}
                  fill={canvasBg === "white" ? "#fff" : "#000"}
                  listening={false}
                />

                {/* Background image */}
                {imageElement && (
                  <KonvaImage
                    id="bg"
                    image={imageElement}
                    x={imageOffsetX}
                    y={imageOffsetY}
                    scaleX={imageScale}
                    scaleY={imageScale}
                    draggable
                    onClick={() => setSelectedId("bg")}
                    onTap={() => setSelectedId("bg")}
                    onDragEnd={(e) => {
                      setImageOffsetX(e.target.x());
                      setImageOffsetY(e.target.y());
                    }}
                  />
                )}

                {/* Boxes */}
                {boxes.map((b) => (
                  <Rect
                    key={b.id}
                    id={b.id}
                    x={b.x}
                    y={b.y}
                    width={b.w}
                    height={b.h}
                    fill="#00000088"
                    stroke="#ffffff"
                    strokeWidth={2}
                    draggable
                    onClick={() => setSelectedId(b.id)}
                    onTap={() => setSelectedId(b.id)}
                    onDragEnd={(e) => {
                      const { x, y } = e.target.position();
                      setBoxes((arr) =>
                        arr.map((it) => (it.id === b.id ? { ...it, x, y } : it))
                      );
                    }}
                    onTransformEnd={(e) => {
                      const node = e.target;
                      const scaleX = node.scaleX();
                      const scaleY = node.scaleY();
                      node.scaleX(1);
                      node.scaleY(1);
                      const next = {
                        x: node.x(),
                        y: node.y(),
                        w: Math.max(2, b.w * scaleX),
                        h: Math.max(2, b.h * scaleY),
                      };
                      setBoxes((arr) =>
                        arr.map((it) =>
                          it.id === b.id ? { ...it, ...next } : it
                        )
                      );
                    }}
                  />
                ))}

                {/* Texts */}
                {texts.map((t) => (
                  <KonvaText
                    key={t.id}
                    id={t.id}
                    text={t.text}
                    fill="#ffffff"
                    fontSize={t.size}
                    x={t.x}
                    y={t.y}
                    draggable
                    onClick={() => setSelectedId(t.id)}
                    onTap={() => setSelectedId(t.id)}
                    onDragEnd={(e) => {
                      const { x, y } = e.target.position();
                      setTexts((arr) =>
                        arr.map((it) => (it.id === t.id ? { ...it, x, y } : it))
                      );
                    }}
                    onTransformEnd={(e) => {
                      const node = e.target;
                      const scaleY = node.scaleY();
                      node.scaleY(1);
                      const nextSize = Math.max(4, Math.round(t.size * scaleY));
                      setTexts((arr) =>
                        arr.map((it) =>
                          it.id === t.id ? { ...it, size: nextSize } : it
                        )
                      );
                    }}
                  />
                ))}

                {/* Transformer */}
                <Transformer ref={transformerRef} rotateEnabled keepRatio />
              </Layer>
            </Stage>
          </div>
        </div>
      </div>
    </div>
  );
}
