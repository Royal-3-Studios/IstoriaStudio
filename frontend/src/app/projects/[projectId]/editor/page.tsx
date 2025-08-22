// src/app/projects/[projectId]/editor/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import type Konva from "konva";
import { saveAs } from "file-saver";
import { toast } from "sonner";

// UI
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import StepHeader, { type Step } from "@/components/editor/StepHeader";
import PresetSelector from "@/components/editor/PresetSelector";
import PresetGallery from "@/components/editor/PresetGallery";

// Data
import {
  PRESETS,
  PRESET_PLACEHOLDER,
  defaultPresetForProjectType,
  type Preset,
} from "@/data/presets";

// === Your local hooks (page is at the same level as /hooks and /components)
import { useProject } from "./hooks/useProject";
import { useCanvasSizing } from "./hooks/useCanvasSizing";
import { useGeneration } from "./hooks/useGeneration";
import { usePrompt } from "./hooks/usePrompt";

// Icons
import {
  Loader,
  Minus,
  Plus as PlusIcon,
  Paperclip,
  ArrowBigRight,
  ArrowBigLeft,
} from "lucide-react";

// Konva (client-only)
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

// ---- Small utils & constants
const DOCKED_TOP_PX = 12;
const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));
const PREVIEW_MAX_LONG_EDGE = 1600;

const getPresetById = (id: string): Preset =>
  id === PRESET_PLACEHOLDER.id
    ? PRESET_PLACEHOLDER
    : (PRESETS as Preset[]).find((p) => p.id === id) ??
      (PRESETS as Preset[])[0];

export default function Page() {
  const { projectId } = useParams<{ projectId: string }>();

  // ----- Project
  const { project, loading: isProjectLoading } = useProject(projectId);

  // ----- Preset selection
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    PRESET_PLACEHOLDER.id
  );
  const selectedPreset = useMemo(
    () => getPresetById(selectedPresetId),
    [selectedPresetId]
  );
  const hasUserSelectedPreset = selectedPresetId !== PRESET_PLACEHOLDER.id;

  // Seed default preset when project loads
  useEffect(() => {
    if (!project) return;
    const def = defaultPresetForProjectType(project.type) as Preset;
    setSelectedPresetId(def.id);
  }, [project]);

  // ----- Step flow
  const stepFlow: Step[] = useMemo(() => {
    const base: Step[] = ["type", "image", "text", "export"];
    return project?.type?.toLowerCase() === "book"
      ? ["type", "image", "text", "layout", "export"]
      : base;
  }, [project?.type]);

  const [currentStep, setCurrentStep] = useState<Step>("type");
  const stepIndex = stepFlow.indexOf(currentStep);
  const prevStep = stepIndex > 0 ? stepFlow[stepIndex - 1] : null;
  const nextStep =
    stepIndex >= 0 && stepIndex + 1 < stepFlow.length
      ? stepFlow[stepIndex + 1]
      : null;
  const prettyStep = (s: Step) =>
    s === "image" ? "Generate" : s[0].toUpperCase() + s.slice(1);
  const nextStepLabel = nextStep ? prettyStep(nextStep) : "";

  // ----- Prompt (your hook)
  const {
    promptText,
    setPromptText,
    isPromptFocused,
    setIsPromptFocused,
    promptTextareaRef,
    promptDocInputRef,
    autosize,
    dock, // docks the prompt UI
  } = usePrompt();

  // ----- Current image element & transform (local state)
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(
    null
  );
  const [imageScale, setImageScale] = useState<number>(1);
  const [imageOffsetX, setImageOffsetX] = useState<number>(0);
  const [imageOffsetY, setImageOffsetY] = useState<number>(0);
  const hasAnyArtwork = !!imageElement;

  // Started image stage?
  const [hasStartedImageStage, setHasStartedImageStage] = useState(false);

  // isPromptDocked when on image step, started, and not focused
  const isPromptDocked =
    currentStep === "image" && hasStartedImageStage && !isPromptFocused;

  // Fit image to the current preset
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

  // When preset changes, refit
  useEffect(() => {
    if (!imageElement) return;
    fitImageToPreset("cover");
  }, [imageElement, selectedPreset.width, selectedPreset.height]);

  // ----- Canvas sizing (your hook: frameW, frameH, previewCapLongEdge?)
  const { containerRef, fitToContainerScale, previewCapScale } =
    useCanvasSizing(
      selectedPreset.width || 1,
      selectedPreset.height || 1,
      PREVIEW_MAX_LONG_EDGE
    );

  // Zoom on top of the base scales
  const ZOOM_MIN = 0.05;
  const ZOOM_MAX = 2;
  const ZOOM_STEP = 0.05;
  const [zoomPercent, setZoomPercent] = useState(0.6);
  const composedStageScale = useMemo(() => {
    const base = Math.min(fitToContainerScale || 1, previewCapScale || 1);
    const z = clamp(zoomPercent, ZOOM_MIN, ZOOM_MAX);
    return base * z;
  }, [fitToContainerScale, previewCapScale, zoomPercent]);

  // Stage sizing (in px)
  const stageWidthPx = Math.max(
    1,
    Math.floor((selectedPreset.width || 1) * composedStageScale)
  );
  const stageHeightPx = Math.max(
    1,
    Math.floor((selectedPreset.height || 1) * composedStageScale)
  );

  const stageRef = useRef<Konva.Stage>(null);

  // ----- Generation (your hook: needs at least 2 args)
  const onImage = (url: string, img: HTMLImageElement) => {
    setImageElement(img);
    setHasStartedImageStage(true);
    fitImageToPreset("cover");
  };
  const { isGenerating, isImageLoading, generatedUrls, generate } =
    useGeneration(projectId);

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
    if (hasUserSelectedPreset) enabled.add("image");
    if (hasAnyArtwork) enabled.add("text");
    if (stepFlow.includes("layout") && hasAnyArtwork) enabled.add("layout");
    if (
      (!stepFlow.includes("layout") && hasAnyArtwork) ||
      stepFlow.includes("layout")
    ) {
      enabled.add("export");
    }
    return stepFlow.filter((s) => enabled.has(s));
  }, [hasUserSelectedPreset, hasAnyArtwork, stepFlow]);

  const canContinue =
    currentStep === "type"
      ? hasUserSelectedPreset
      : currentStep === "image"
        ? hasAnyArtwork && !isGenerating && !isImageLoading
        : currentStep === "export"
          ? false
          : true;

  function goBack() {
    if (!prevStep) return;
    setCurrentStep(prevStep);
  }
  function goForward() {
    if (!nextStep || !canContinue) return;
    setCurrentStep(nextStep);
  }

  // Background color toggle
  const [canvasBg, setCanvasBg] = useState<"white" | "black">("white");

  // Blur rule: blur while prompt editor is visible (centered) or before first gen/upload
  const shouldBlurCanvas =
    currentStep === "image" && (!hasStartedImageStage || !isPromptDocked);

  // ----- Prompt: hidden file inputs
  const imageInputRef = useRef<HTMLInputElement>(null);
  function openImagePicker() {
    imageInputRef.current?.click();
  }
  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setHasStartedImageStage(true);

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

  // Submit/generate action shared by Enter and button
  async function handleGenerate() {
    if (!promptText.trim()) return;
    // Dock immediately (so Enter behaves like the button)
    dock();
    setHasStartedImageStage(true);
    // Your hook’s generate likely expects positional args:
    // generate(prompt: string, presetId: string, width: number, height: number)
    await generate({
      prompt: promptText,
      presetId: selectedPreset.id,
      width: selectedPreset.width,
      height: selectedPreset.height,
      onImage: (url, img) => {
        // optional: handle the generated image
        console.log("Generated image:", url, img);
      },
    });
  }

  // Render
  if (isProjectLoading) return <div className="p-6">Loading…</div>;
  if (!project) return <div className="p-6">Project not found.</div>;

  const showPromptUI = currentStep === "image";

  return (
    // <div className="flex flex-col min-h-screen overflow-x-hidden">
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* ====== HEADER ====== */}
      <div className="relative z-30 h-12 shrink-0 flex items-center px-4 w-full">
        <StepHeader
          step={currentStep}
          steps={stepFlow}
          enabled={enabledSteps}
          onChangeAction={(s) => setCurrentStep(s)}
        />
      </div>

      {/* ====== CONTENT AREA ====== */}
      <div className="relative flex-1 min-h-0 min-w-0 p-4 pt-2">
        {/* Top rail (Steps 2+) */}
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

        {/* ====== TYPE STEP ====== */}
        {currentStep === "type" && (
          <div className="absolute inset-0 z-20 pointer-events-none">
            <div
              className="absolute left-1/2 w-[min(100%,80rem)] px-4 transition-all duration-300 ease-out pointer-events-auto"
              style={{
                willChange: "transform, top",
                // top: hasUserSelectedPreset ? DOCKED_TOP_PX : "615%",
                // transform: hasUserSelectedPreset
                //   ? "translate(-50%, 0) scale(0.92)"
                //   : "translate(-50%, -50%) scale(1)",
                top: hasUserSelectedPreset ? DOCKED_TOP_PX : 12, // anchor to the top
                transform: hasUserSelectedPreset
                  ? "translate(-50%, 0) scale(0.92)"
                  : "translate(-50%, 0) scale(1)",
              }}
            >
              <div className="relative mx-auto transition-all duration-300 ease-out w-full">
                {!hasUserSelectedPreset ? (
                  <Card className="mb-12 border bg-card shadow-md px-4 py-6">
                    <div className="flex w-full flex-col gap-4">
                      <div className="text-xs sm:text-sm text-muted-foreground text-center font-bold">
                        Pick a size/type to preview the canvas.
                      </div>
                      <div className="mx-auto w-full">
                        {/* Height frame for the gallery — tune the numbers as you like */}
                        <div className="max-w-7xl mx-auto h-[min(72vh,720px)]">
                          <PresetGallery
                            presets={PRESETS as unknown as Preset[]}
                            value={null}
                            onChangeAction={(id) => setSelectedPresetId(id)}
                            projectType={project.type}
                            showFilters
                          />
                        </div>
                      </div>
                    </div>
                  </Card>
                ) : (
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center w-full">
                    <div />
                    <div className="justify-self-center max-w-md w-full">
                      <PresetSelector
                        value={selectedPresetId}
                        onValueChangeAction={(id) => setSelectedPresetId(id)}
                      />
                    </div>
                    <div className="ml-1 mt-4 justify-self-end">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={goForward}
                        disabled={!canContinue}
                        className="text-xs sm:text-sm rounded-full h-8 mt-1 cursor-pointer hover:scale-110 px-2"
                        title="Continue to Generate"
                      >
                        <ArrowBigRight className="h-4 w-4 shrink-0" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ====== PROMPT OVERLAY (Image Step) ====== */}
        {showPromptUI && (
          <div className="absolute inset-0 z-20 pointer-events-none">
            <div
              className="absolute left-1/2 w-[min(100%,80rem)] px-4 transition-all duration-300 ease-out pointer-events-auto"
              style={{
                willChange: "transform, top",
                top: DOCKED_TOP_PX, // always dock at 12px
                transform: hasUserSelectedPreset
                  ? "translate(-50%, 0) scale(0.96)" // gentle scale once chosen
                  : "translate(-50%, 0) scale(1)", // no vertical centering anymore
              }}
            >
              <div
                className={[
                  "relative mx-auto transition-all duration-300 ease-out",
                  isPromptDocked ? "max-w-md" : "max-w-3xl",
                ].join(" ")}
              >
                {/* Hidden inputs */}
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
                    isPromptDocked
                      ? "h-10 p-0 overflow-hidden rounded-2xl"
                      : "",
                  ].join(" ")}
                >
                  {isPromptDocked ? (
                    // Docked toolbar (size 6 → 8 at sm)
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
                        </div>
                      </div>
                    </>
                  )}
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* ====== CANVAS AREA ====== */}
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
                {(isGenerating || isImageLoading) && currentStep === "image" ? (
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
                    >
                      <Layer
                        scaleX={composedStageScale}
                        scaleY={composedStageScale}
                      >
                        {/* Canvas background / frame */}
                        <Rect
                          x={0}
                          y={0}
                          width={selectedPreset.width || 1}
                          height={selectedPreset.height || 1}
                          fill={canvasBg === "white" ? "#fff" : "#000"}
                        />

                        {/* Image */}
                        {imageElement && (
                          <KonvaImage
                            image={imageElement}
                            x={imageOffsetX}
                            y={imageOffsetY}
                            scaleX={imageScale}
                            scaleY={imageScale}
                            draggable={currentStep !== "export"}
                            onDragEnd={(e) => {
                              setImageOffsetX(e.target.x());
                              setImageOffsetY(e.target.y());
                            }}
                          />
                        )}

                        {/* Example overlay texts (hidden on image step) */}
                        {currentStep !== "image" && imageElement && (
                          <>
                            <KonvaText
                              text={project.title ?? "Title"}
                              fill={"#ffffff"}
                              fontSize={Math.round(
                                (selectedPreset.height || 1) * 0.12
                              )}
                              fontStyle="bold"
                              x={Math.round((selectedPreset.width || 1) * 0.06)}
                              y={Math.round(
                                (selectedPreset.height || 1) * 0.08
                              )}
                              width={Math.round(
                                (selectedPreset.width || 1) * 0.88
                              )}
                              align="center"
                              listening={false}
                            />
                            {!!project.description && (
                              <KonvaText
                                text={project.description}
                                fill={"#ffffff"}
                                fontSize={Math.round(
                                  (selectedPreset.height || 1) * 0.06
                                )}
                                x={Math.round(
                                  (selectedPreset.width || 1) * 0.08
                                )}
                                y={Math.round(
                                  (selectedPreset.height || 1) * 0.28
                                )}
                                width={Math.round(
                                  (selectedPreset.width || 1) * 0.84
                                )}
                                align="center"
                                listening={false}
                              />
                            )}
                            <KonvaText
                              text={"Author"}
                              fill={"#ffffff"}
                              fontSize={Math.round(
                                (selectedPreset.height || 1) * 0.05
                              )}
                              x={Math.round((selectedPreset.width || 1) * 0.1)}
                              y={Math.round(
                                (selectedPreset.height || 1) * 0.85
                              )}
                              width={Math.round(
                                (selectedPreset.width || 1) * 0.8
                              )}
                              align="center"
                              listening={false}
                            />
                          </>
                        )}
                      </Layer>
                    </Stage>
                  </div>
                )}
              </div>
            </div>

            {/* Left: Zoom controls */}
            <div className="pointer-events-auto z-10 transition-all duration-300 ease-out absolute left-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5">
              <Button
                variant="outline"
                className="rounded-full cursor-pointer"
                size="icon"
                onClick={() =>
                  setZoomPercent((z) =>
                    Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2))
                  )
                }
                aria-label="Zoom in"
              >
                <PlusIcon className="h-4 w-4" />
              </Button>
              <span className="px-2 py-1 rounded-xl text-xs bg-background/80 border tabular-nums">
                {Math.round(zoomPercent * 100)}%
              </span>
              <Button
                variant="outline"
                className="rounded-full cursor-pointer"
                size="icon"
                onClick={() =>
                  setZoomPercent((z) =>
                    Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2))
                  )
                }
                aria-label="Zoom out"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="cursor-pointer"
                onClick={() => setZoomPercent(0.6)}
              >
                Reset
              </Button>
            </div>

            {/* Right: background toggle */}
            {/* <div className="pointer-events-auto z-10 transition-all duration-300 ease-out absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5">
              <Button
                size="sm"
                variant={canvasBg === "white" ? "secondary" : "outline"}
                className="h-6 sm:h-8 rounded-full text-[10px] sm:text-xs"
                onClick={() => setCanvasBg("white")}
                aria-label="White background"
              >
                White
              </Button>
              <Button
                size="sm"
                variant={canvasBg === "black" ? "secondary" : "outline"}
                className="h-6 sm:h-8 rounded-full text-[10px] sm:text-xs"
                onClick={() => setCanvasBg("black")}
                aria-label="Black background"
              >
                Black
              </Button>
            </div> */}
          </div>
        </div>

        {/* ====== BOTTOM BAR ====== */}
        <div className="absolute bottom-2 inset-x-3 flex items-center justify-between text-xs text-muted-foreground">
          <div className="truncate">
            {/* {selectedPreset.label} */}
            {hasUserSelectedPreset && <br />}
            {/* {selectedPreset.width}×{selectedPreset.height}px */}
          </div>

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
