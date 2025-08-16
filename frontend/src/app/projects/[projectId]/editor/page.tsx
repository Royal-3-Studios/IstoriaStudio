// src/app/projects/[projectId]/editor/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import type Konva from "konva";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import { BACKEND } from "@/lib/api";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import StepHeader, { type Step } from "@/components/editor/StepHeader";
import { PRESETS, defaultPresetForProjectType } from "@/data/presets";
import PresetSelector from "@/components/editor/PresetSelector";
import { Loader, Minus, Plus as PlusIcon, Paperclip } from "lucide-react";

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

// Types
type Project = {
  id: string;
  title: string;
  type: string;
  description?: string | null;
};

// Helpers
const getPresetById = (id: string) =>
  PRESETS.find((p) => p.id === id) ?? PRESETS[0];

const DOCKED_TOP_PX = 12;

const clampNumber = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

/** Breakpoint-based default zoom:
 * > 700px => 0.6
 * 500–700px => 0.4
 * < 500px => 0.3
 */
function getBreakpointDefaultZoom(containerWidthPx: number) {
  if (containerWidthPx > 700) return 0.6;
  if (containerWidthPx >= 500) return 0.4;
  return 0.3;
}

export default function ProjectEditorPage() {
  const { projectId } = useParams<{ projectId: string }>();

  // ------- Project load -------
  const [project, setProject] = useState<Project | null>(null);
  const [isProjectLoading, setIsProjectLoading] = useState(true);

  useEffect(() => {
    let cancelLoad = false;
    (async () => {
      try {
        const response = await fetch(`/api/project/${projectId}`, {
          credentials: "include",
        });
        if (!response.ok) throw new Error(await response.text());
        const projectData: Project = await response.json();
        if (!cancelLoad) setProject(projectData);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load project");
      } finally {
        if (!cancelLoad) setIsProjectLoading(false);
      }
    })();
    return () => {
      cancelLoad = true;
    };
  }, [projectId]);

  // ------- Presets (Type step) -------
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    PRESETS[0]?.id
  );
  useEffect(() => {
    if (!project) return;
    const def = defaultPresetForProjectType(project.type);
    setSelectedPresetId(def.id);
  }, [project]);
  const selectedPreset = useMemo(
    () => getPresetById(selectedPresetId),
    [selectedPresetId]
  );

  // User must *interact* to choose a size
  const [hasUserSelectedPreset, setHasUserSelectedPreset] = useState(false);
  const isTypeDocked = hasUserSelectedPreset; // centered until selection; then docked

  // ------- Step flow (Type → Image → Text → [Layout] → Export) -------
  const stepFlow: Step[] = useMemo(() => {
    const baseFlow: Step[] = ["type", "image", "text", "export"];
    return project?.type?.toLowerCase() === "book"
      ? ["type", "image", "text", "layout", "export"]
      : baseFlow;
  }, [project?.type]);

  const [currentStep, setCurrentStep] = useState<Step>("type");
  useEffect(() => {
    if (!stepFlow.includes(currentStep)) setCurrentStep(stepFlow[0]);
  }, [stepFlow, currentStep]);

  // Confirm Type to move on to Image step
  const [typeConfirmed, setTypeConfirmed] = useState(false);

  // Which steps have been visited/finished
  const [visitedByStep, setVisitedByStep] = useState<Record<Step, boolean>>({
    image: false,
    type: false,
    text: false,
    layout: false,
    export: false,
  });

  // Mark downstream steps visited as the user progresses
  useEffect(() => {
    if (currentStep === "text" && visitedByStep.image && !visitedByStep.text) {
      setVisitedByStep((prev) => ({ ...prev, text: true }));
    }
    if (
      currentStep === "layout" &&
      visitedByStep.text &&
      !visitedByStep.layout
    ) {
      setVisitedByStep((prev) => ({ ...prev, layout: true }));
    }
    if (
      currentStep === "export" &&
      (visitedByStep.text || visitedByStep.layout) &&
      !visitedByStep.export
    ) {
      setVisitedByStep((prev) => ({ ...prev, export: true }));
    }
  }, [currentStep, visitedByStep]);

  // ------- Layers / image -------
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(
    null
  );
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [imageScale, setImageScale] = useState<number>(1);
  const [imageOffsetX, setImageOffsetX] = useState<number>(0);
  const [imageOffsetY, setImageOffsetY] = useState<number>(0);

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

  // ------- Text layers -------
  const [titleText, setTitleText] = useState("Title");
  const [subtitleText, setSubtitleText] = useState("Subtitle");
  const [authorText, setAuthorText] = useState("Author");
  const [primaryTextColor] = useState("#ffffff");

  useEffect(() => {
    if (!project) return;
    setTitleText(project.title ?? "Title");
    if (project.description) setSubtitleText(project.description);
  }, [project]);

  // ------- Prompt + generation -------
  const [promptText, setPromptText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedUrls, setGeneratedUrls] = useState<string[]>([]);
  const [attachedPromptDocName, setAttachedPromptDocName] = useState<
    string | null
  >(null);

  // Track last size we generated at (to propose a crisp re-gen after size change)
  const [lastGeneratedSize, setLastGeneratedSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  // After first generate/upload
  const [hasStartedImageStage, setHasStartedImageStage] = useState(false);

  // Show canvas as soon as user has chosen a size (blank preview),
  // OR once they have actually generated/uploaded an image.
  const shouldShowCanvas = hasUserSelectedPreset || hasStartedImageStage;

  const hasAnyArtwork = !!imageElement || generatedUrls.length > 0;
  const showPromptUI = currentStep === "image"; // prompt only on Image step
  const [isPromptFocused, setIsPromptFocused] = useState(false);
  const isPromptDocked =
    showPromptUI && hasStartedImageStage && !isPromptFocused; // dock after first generate/upload

  // Hidden inputs / prompt ref
  const promptDocInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

  function autosizePrompt(textarea?: HTMLTextAreaElement | null) {
    const el = textarea ?? promptTextareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 260) + "px";
  }

  function openPromptDocPicker() {
    promptDocInputRef.current?.click();
  }
  async function handlePromptDocChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    if (!file) return;
    setAttachedPromptDocName(file.name);
    const text = await file.text();
    setPromptText(text.trim());
    setTimeout(() => autosizePrompt(), 0);
  }

  // Optional: upload a starting image (only meaningful on Image step)
  function openImagePicker() {
    imageInputRef.current?.click();
  }
  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setHasStartedImageStage(true);
    setIsImageLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        setImageElement(img);
        setIsImageLoading(false);
        fitImageToPreset("cover");
        setVisitedByStep((prev) => ({ ...prev, image: true }));
      };
      img.src = reader.result as string;
      setGeneratedUrls((prev) => [reader.result as string, ...prev]);
      toast.success("Image loaded");
    };
    reader.readAsDataURL(file);
  }

  // Generate via API — uses CURRENT preset (Type → Generate)
  async function handleGenerate() {
    try {
      if (!promptText.trim()) return;
      setHasStartedImageStage(true);
      setIsGenerating(true);
      setIsImageLoading(true);

      const response = await fetch(`${BACKEND}/api/generated-asset/generate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          prompt: promptText,
          preset: selectedPreset.id,
          width: selectedPreset.width,
          height: selectedPreset.height,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      const url = (data.url ?? data.asset?.url) as string;
      if (!url) throw new Error("No image URL returned.");

      setGeneratedUrls((prev) => [url, ...prev]);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        setImageElement(img);
        setIsImageLoading(false);
        fitImageToPreset("cover");
        setVisitedByStep((prev) => ({ ...prev, image: true }));
      };
      img.src = url;

      setLastGeneratedSize({
        width: selectedPreset.width,
        height: selectedPreset.height,
      });

      toast.success("Generated!");
    } catch (error) {
      console.error(error);
      toast.error("Generation failed");
      setIsImageLoading(false);
    } finally {
      setIsGenerating(false);
    }
  }

  // ------- Fit-to-container preview (throttled) -------
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [canvasContainerSize, setCanvasContainerSize] = useState({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    if (!canvasContainerRef.current) return;
    const containerEl = canvasContainerRef.current;

    let rafId = 0;
    const measureContainer = () => {
      const rect = containerEl.getBoundingClientRect();
      setCanvasContainerSize({
        width: Math.max(0, rect.width - 8),
        height: Math.max(0, rect.height - 8),
      });
    };
    const scheduleMeasure = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measureContainer);
    };

    measureContainer();
    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(containerEl);
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, []);

  const fitToContainerScale = useMemo(() => {
    if (!canvasContainerSize.width || !canvasContainerSize.height) return 1;
    return Math.min(
      canvasContainerSize.width / selectedPreset.width,
      canvasContainerSize.height / selectedPreset.height
    );
  }, [
    canvasContainerSize.width,
    canvasContainerSize.height,
    selectedPreset.width,
    selectedPreset.height,
  ]);

  const PREVIEW_MAX_LONG_EDGE = 1600;
  const previewCapScale = useMemo(() => {
    const longestEdge = Math.max(selectedPreset.width, selectedPreset.height);
    return Math.min(1, PREVIEW_MAX_LONG_EDGE / longestEdge);
  }, [selectedPreset.width, selectedPreset.height]);

  // ------- Zoom (with breakpoint defaults) -------
  const ZOOM_MIN = 0.05;
  const ZOOM_MAX = 1;
  const ZOOM_STEP = 0.1;

  const [zoomPercent, setZoomPercent] = useState(0.6);
  const userHasAdjustedZoomRef = useRef(false);
  const hasSetInitialZoomRef = useRef(false);

  const handleZoomIn = () => {
    userHasAdjustedZoomRef.current = true;
    setZoomPercent((prev) =>
      Math.min(ZOOM_MAX, +(prev + ZOOM_STEP).toFixed(2))
    );
  };
  const handleZoomOut = () => {
    userHasAdjustedZoomRef.current = true;
    setZoomPercent((prev) =>
      Math.max(ZOOM_MIN, +(prev - ZOOM_STEP).toFixed(2))
    );
  };
  const handleResetZoom = () => {
    userHasAdjustedZoomRef.current = false;
    hasSetInitialZoomRef.current = false; // allow recompute
    const decisionWidth =
      canvasContainerSize.width ||
      (typeof window !== "undefined" ? window.innerWidth : 800);
    setZoomPercent(getBreakpointDefaultZoom(decisionWidth));
  };

  // Pick a breakpointed default zoom when the canvas first appears
  useEffect(() => {
    if (!shouldShowCanvas) return;
    if (!hasSetInitialZoomRef.current && !userHasAdjustedZoomRef.current) {
      const decisionWidth =
        canvasContainerSize.width ||
        (typeof window !== "undefined" ? window.innerWidth : 800);
      setZoomPercent(getBreakpointDefaultZoom(decisionWidth));
      hasSetInitialZoomRef.current = true;
    }
  }, [shouldShowCanvas, canvasContainerSize.width]);

  // Keyboard shortcuts for zoom
  useEffect(() => {
    const onKeydown = (event: KeyboardEvent) => {
      const targetEl = event.target as HTMLElement | null;
      const tag = targetEl?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || targetEl?.isContentEditable)
        return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        handleZoomIn();
      } else if (event.key === "-") {
        event.preventDefault();
        handleZoomOut();
      } else if (event.key === "0") {
        event.preventDefault();
        handleResetZoom();
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [canvasContainerSize.width]);

  const composedStageScale = useMemo(() => {
    const baseScale = Math.min(fitToContainerScale, previewCapScale);
    const zoomClamped = clampNumber(zoomPercent, ZOOM_MIN, ZOOM_MAX);
    return baseScale * zoomClamped;
  }, [fitToContainerScale, previewCapScale, zoomPercent]);

  const stageWidthPx = Math.max(
    1,
    Math.floor(selectedPreset.width * composedStageScale)
  );
  const stageHeightPx = Math.max(
    1,
    Math.floor(selectedPreset.height * composedStageScale)
  );

  // ------- Auto-fit when preset changes -------
  useEffect(() => {
    if (!imageElement) return;
    fitImageToPreset("cover"); // refit to new aspect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPreset.width, selectedPreset.height]);

  // ------- Export -------
  const stageRef = useRef<Konva.Stage>(null);
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

  const aspectRatio = selectedPreset.width / selectedPreset.height;
  const isPresetVeryWide = aspectRatio >= 1.6;
  const isBookFlow = project?.type?.toLowerCase() === "book";

  // Compute which steps are enabled
  const enabledSteps: Step[] = useMemo(() => {
    const enabled = new Set<Step>();
    enabled.add("type");
    if (typeConfirmed) enabled.add("image");
    if (visitedByStep.image) enabled.add("text");
    if (isBookFlow && visitedByStep.text) enabled.add("layout");
    if (
      (!isBookFlow && visitedByStep.text) ||
      (isBookFlow && visitedByStep.layout)
    ) {
      enabled.add("export");
    }
    return stepFlow.filter((s) => enabled.has(s));
  }, [typeConfirmed, visitedByStep, isBookFlow, stepFlow]);

  // Is the current preset different from the last generation size?
  const sizeMismatch =
    !!lastGeneratedSize &&
    (lastGeneratedSize.width !== selectedPreset.width ||
      lastGeneratedSize.height !== selectedPreset.height);

  // ======= LOADING/BLANK LOGIC (the fix) =======
  // Only show loading skeleton while we're on the Image step and actually generating/uploading
  const showLoadingSkeleton =
    currentStep === "image" && (isGenerating || isImageLoading);

  // Show a blank preview canvas on Type after the user picks a size
  const showBlankCanvasPreview =
    currentStep === "type" &&
    hasUserSelectedPreset &&
    !hasAnyArtwork &&
    !isImageLoading;

  // Render the Stage whenever the canvas should be visible and we’re NOT in a loading state.
  // This includes the blank preview case (Type step) and normal cases with/without artwork.
  const shouldRenderStage = shouldShowCanvas && !showLoadingSkeleton;

  // ======= RENDER =======
  if (isProjectLoading) return <div className="p-6">Loading…</div>;
  if (!project) return <div className="p-6">Project not found.</div>;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-x-hidden">
      {/* ====== HEADER ====== */}
      <div className="relative z-30 h-12 shrink-0 flex items-center px-4 w-full">
        <StepHeader
          step={currentStep}
          steps={stepFlow}
          enabled={enabledSteps}
          onChangeAction={(s) => {
            if (s === "image" && !typeConfirmed) return; // don't jump early
            setCurrentStep(s);
          }}
        />
      </div>

      {/* ====== CONTENT AREA ====== */}
      <div className="relative flex-1 min-h-0 min-w-0 p-4 pt-2">
        {/* ----- TYPE SELECT OVERLAY (Step 1) ----- */}
        {currentStep === "type" && (
          <div className="absolute inset-0 z-20 pointer-events-none">
            <div
              className="absolute left-1/2 w-[min(100%,64rem)] px-4 transition-all duration-300 ease-out pointer-events-auto"
              style={{
                willChange: "transform, top",
                top: isTypeDocked ? DOCKED_TOP_PX : "50%",
                transform: isTypeDocked
                  ? "translate(-50%, 0) scale(0.92)"
                  : "translate(-50%, -50%) scale(1)",
              }}
            >
              <div
                className={[
                  "relative mx-auto transition-all duration-300 ease-out",
                  isTypeDocked ? "max-w-md" : "max-w-xl",
                ].join(" ")}
              >
                {isTypeDocked ? (
                  <div className="h-10 flex items-center px-2 ">
                    <div className="w-full">
                      <PresetSelector
                        value={selectedPresetId}
                        onValueChangeAction={(id) => {
                          setSelectedPresetId(id);
                          setHasUserSelectedPreset(true);
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <Card
                    className={[
                      "relative transition-all duration-300 ease-out bg-secondary",
                      isTypeDocked
                        ? "h-10 p-0 overflow-hidden opacity-50 rounded-2xl hover:opacity-75 mt-4 md:mt-1"
                        : "h-auto opacity-100 p-4",
                    ].join(" ")}
                  >
                    {!isTypeDocked ? (
                      <div className="flex flex-col gap-3">
                        <div className="text-sm text-muted-foreground text-center font-bold">
                          Choose your size / type to preview the canvas.
                        </div>
                        <PresetSelector
                          value={selectedPresetId}
                          onValueChangeAction={(id) => {
                            setSelectedPresetId(id);
                            setHasUserSelectedPreset(true);
                          }}
                        />
                      </div>
                    ) : (
                      <div className="h-10 flex items-center px-2">
                        <div className="w-full">
                          <PresetSelector
                            value={selectedPresetId}
                            onValueChangeAction={(id) => {
                              setSelectedPresetId(id);
                              setHasUserSelectedPreset(true);
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </Card>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ----- PROMPT OVERLAY (Step 2) ----- */}
        {showPromptUI && (
          <div className="absolute inset-0 z-20 pointer-events-none">
            <div
              className="absolute left-1/2 w-[min(100%,80rem)] px-4 transition-all duration-300 ease-out pointer-events-auto"
              style={{
                willChange: "transform, top",
                top: isPromptDocked ? DOCKED_TOP_PX : "50%",
                transform: isPromptDocked
                  ? "translate(-50%, 0) scale(0.92)"
                  : "translate(-50%, -50%) scale(1)",
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
                  onChange={handlePromptDocChange}
                />
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageChange}
                />

                {/* Prompt card */}
                <Card
                  className={[
                    "relative transition-all duration-300 ease-out bg-secondary",
                    isPromptDocked
                      ? "h-10 p-0 overflow-hidden opacity-50 rounded-2xl hover:opacity-75 mt-4 md:mt-1"
                      : "h-auto opacity-100",
                  ].join(" ")}
                >
                  <textarea
                    ref={promptTextareaRef}
                    className={[
                      "w-full bg-transparent border-none outline-none resize-none ",
                      "rounded-2xl pl-5 pr-24",
                      isPromptDocked
                        ? "py-2.5 text-sm"
                        : " text-base min-h-[7rem]",
                      "placeholder:text-muted-foreground",
                      "focus:ring-0 focus:outline-none",
                      "whitespace-pre-wrap break-words overflow-hidden",
                      "transition-all duration-300",
                    ].join(" ")}
                    placeholder="Describe what to generate…  (Shift+Enter = newline, Enter = generate)"
                    value={promptText}
                    onFocus={() => {
                      setIsPromptFocused(true);
                      setTimeout(() => autosizePrompt(), 0);
                    }}
                    onBlur={() =>
                      setTimeout(() => setIsPromptFocused(false), 120)
                    }
                    onChange={(event) => setPromptText(event.target.value)}
                    onInput={(event) => {
                      if (!isPromptDocked) autosizePrompt(event.currentTarget);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        handleGenerate();
                      }
                    }}
                    rows={isPromptDocked ? 1 : 4}
                    style={isPromptDocked ? { height: "2.5rem" } : undefined}
                  />

                  {/* Actions only when centered */}
                  {!isPromptDocked && (
                    <>
                      <button
                        type="button"
                        onClick={openPromptDocPicker}
                        className="absolute left-3 bottom-2 inline-flex items-center gap-1 text-xs rounded-full px-2 py-1 border bg-muted/60 hover:bg-muted transition"
                        title="Upload prompt (.txt)"
                        aria-label="Upload prompt"
                      >
                        <Paperclip className="h-3 w-3" />
                        Attach
                      </button>

                      <Button
                        type="button"
                        size="sm"
                        className="absolute right-3 bottom-2 rounded-full"
                        onClick={handleGenerate}
                        disabled={isGenerating || !promptText.trim()}
                        title="Generate"
                      >
                        {isGenerating ? (
                          <>
                            <Loader className="mr-2 h-4 w-4 animate-spin" />
                            Generating…
                          </>
                        ) : (
                          <>
                            <PlusIcon className="mr-2 h-4 w-4" />
                            Generate
                          </>
                        )}
                      </Button>
                    </>
                  )}
                </Card>

                {!isPromptDocked && attachedPromptDocName && (
                  <div className="mt-1">
                    <Badge variant="secondary">{attachedPromptDocName}</Badge>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ----- CANVAS AREA ----- */}
        <div className="mt-2 absolute inset-0 pt-16 md:pt-14">
          <div
            className={[
              "relative h-full w-full min-h-0 min-w-0 transition-all duration-300",
              // Blur canvas when prompt is centered during Image step
              showPromptUI && hasStartedImageStage && !isPromptDocked
                ? "blur-[10px] opacity-60"
                : "",
            ].join(" ")}
          >
            <div
              ref={canvasContainerRef}
              className="flex h-full w-full min-h-0 min-w-0 items-center justify-center"
            >
              <div className="max-h-full max-w-full">
                {/* Loading skeleton ONLY during generate/upload on the Image step */}
                {showLoadingSkeleton && (
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
                )}

                {/* Stage: shows for blank preview (Type step) and for real images */}
                {shouldRenderStage && (
                  <div
                    className="inline-block border rounded-sm shadow-sm"
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
                          width={selectedPreset.width}
                          height={selectedPreset.height}
                          fill="#000"
                        />

                        {/* Uploaded or generated image (if present); otherwise it's a blank preview */}
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

                        {/* Title/subtitle/author only when NOT on Image step and when we have art */}
                        {currentStep !== "image" && imageElement && (
                          <>
                            <KonvaText
                              text={titleText}
                              fill={primaryTextColor}
                              fontSize={Math.round(
                                selectedPreset.height * 0.12
                              )}
                              fontStyle="bold"
                              x={Math.round(selectedPreset.width * 0.06)}
                              y={Math.round(selectedPreset.height * 0.08)}
                              width={Math.round(selectedPreset.width * 0.88)}
                              align="center"
                              listening={false}
                            />
                            {!!subtitleText && (
                              <KonvaText
                                text={subtitleText}
                                fill={primaryTextColor}
                                fontSize={Math.round(
                                  selectedPreset.height * 0.06
                                )}
                                x={Math.round(selectedPreset.width * 0.08)}
                                y={Math.round(selectedPreset.height * 0.28)}
                                width={Math.round(selectedPreset.width * 0.84)}
                                align="center"
                                listening={false}
                              />
                            )}
                            <KonvaText
                              text={authorText}
                              fill={primaryTextColor}
                              fontSize={Math.round(
                                selectedPreset.height * 0.05
                              )}
                              x={Math.round(selectedPreset.width * 0.1)}
                              y={Math.round(selectedPreset.height * 0.85)}
                              width={Math.round(selectedPreset.width * 0.8)}
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

            {/* Zoom controls */}
            {shouldRenderStage && (
              <div
                className={[
                  "pointer-events-auto z-10 transition-all duration-300 ease-out",
                  isPresetVeryWide
                    ? "absolute top-3 left-3 flex flex-row items-center gap-1.5"
                    : "absolute left-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5",
                ].join(" ")}
              >
                <Button
                  variant="outline"
                  className="rounded-full"
                  size="icon"
                  onClick={handleZoomOut}
                  aria-label="Zoom out"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="px-2 py-1 rounded-xl text-xs bg-background/80 border tabular-nums">
                  {Math.round(zoomPercent * 100)}%
                </span>
                <Button
                  variant="outline"
                  className="rounded-full"
                  size="icon"
                  onClick={handleZoomIn}
                  aria-label="Zoom in"
                >
                  <PlusIcon className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={handleResetZoom}>
                  Reset
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom utility row */}
        <div className="absolute bottom-2 inset-x-3 flex items-center justify-between text-xs text-muted-foreground">
          <div className="truncate">
            {selectedPreset.label} • {selectedPreset.width}×
            {selectedPreset.height}px
          </div>

          <div className="flex items-center gap-2">
            {/* TYPE: Continue button appears only after a user has picked a size */}
            {currentStep === "type" && hasUserSelectedPreset && (
              <Button
                size="sm"
                className="rounded-full"
                onClick={() => {
                  setTypeConfirmed(true);
                  setVisitedByStep((prev) => ({ ...prev, type: true }));
                  setCurrentStep("image");
                }}
              >
                Continue to Generate
              </Button>
            )}

            {/* IMAGE: Offer crisp regeneration if size changed since last generation */}
            {currentStep === "image" && hasAnyArtwork && sizeMismatch && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleGenerate}
                disabled={isGenerating || !promptText.trim()}
                title={`Regenerate at ${selectedPreset.width}×${selectedPreset.height}`}
              >
                {isGenerating
                  ? "Regenerating…"
                  : `Regenerate @ ${selectedPreset.width}×${selectedPreset.height}`}
              </Button>
            )}

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
