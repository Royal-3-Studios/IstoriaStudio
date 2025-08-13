"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import type Konva from "konva";
import { saveAs } from "file-saver";
import { toast } from "sonner";

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
const presetById = (id: string) =>
  PRESETS.find((p) => p.id === id) ?? PRESETS[0];

// Offset (px) used when the prompt is docked under the header
const DOCKED_TOP = 12;

export default function ProjectEditorPage() {
  const { projectId } = useParams<{ projectId: string }>();

  // project load
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/project/${projectId}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(await res.text());
        const data: Project = await res.json();
        if (!cancelled) setProject(data);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load project");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // presets
  const [presetId, setPresetId] = useState<string>(PRESETS[0]?.id);
  useEffect(() => {
    if (!project) return;
    const def = defaultPresetForProjectType(project.type);
    setPresetId(def.id);
  }, [project]);
  const preset = useMemo(() => presetById(presetId), [presetId]);

  // steps
  const steps: Step[] = useMemo(() => {
    const base: Step[] = ["image", "type", "text", "export"];
    return project?.type?.toLowerCase() === "book"
      ? ["image", "type", "text", "layout", "export"]
      : base;
  }, [project?.type]);

  const [step, setStep] = useState<Step>("image");
  useEffect(() => {
    if (!steps.includes(step)) setStep(steps[0]);
  }, [steps, step]);

  // layers / image
  const [imgObj, setImgObj] = useState<HTMLImageElement | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [imgScale, setImgScale] = useState<number>(1);
  const [imgX, setImgX] = useState<number>(0);
  const [imgY, setImgY] = useState<number>(0);

  // text layers
  const [title, setTitle] = useState("Title");
  const [subtitle, setSubtitle] = useState("Subtitle");
  const [author, setAuthor] = useState("Author");
  const [textColor] = useState("#ffffff");

  useEffect(() => {
    if (!project) return;
    setTitle(project.title ?? "Title");
    if (project.description) setSubtitle(project.description);
  }, [project]);

  // prompt + generate
  const [prompt, setPrompt] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [generated, setGenerated] = useState<string[]>([]);
  const [promptDocName, setPromptDocName] = useState<string | null>(null);

  // UX state
  const [started, setStarted] = useState(false); // set true after first generate/upload
  const [promptActive, setPromptActive] = useState(false); // focused/centered prompt
  const hasArt = !!imgObj || generated.length > 0;
  const showCanvas = started; // canvas area shows after first submit/upload
  const docked = started && !promptActive; // dock to top after first action when not focused

  // refs
  const promptDocInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // textarea autosize when centered/active
  function autosize(el?: HTMLTextAreaElement | null) {
    const t = el ?? promptRef.current;
    if (!t) return;
    t.style.height = "0px";
    t.style.height = Math.min(t.scrollHeight, 260) + "px";
  }

  // pick prompt doc
  function pickPromptDoc() {
    promptDocInputRef.current?.click();
  }
  async function onPromptDocChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPromptDocName(f.name);
    const text = await f.text();
    setPrompt(text.trim());
    setPromptActive(true); // keep centered & active after attaching
    setTimeout(() => autosize(), 0);
  }

  // image upload
  function pickImage() {
    imageInputRef.current?.click();
  }
  function onImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setStarted(true);
    setPromptActive(false);
    setImgLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        setImgObj(img);
        setImgLoading(false);
      };
      img.src = reader.result as string;
      setGenerated((prev) => [reader.result as string, ...prev]);
      toast.success("Image loaded");
    };
    reader.readAsDataURL(f);
  }

  // generation
  async function handleGenerate() {
    try {
      if (!prompt.trim()) return;
      setStarted(true);
      setPromptActive(false); // dock after submit
      setGenBusy(true);
      setImgLoading(true);

      const res = await fetch(`/api/assets/generate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          prompt,
          preset: preset.id,
          width: preset.width,
          height: preset.height,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const url = (data.url ?? data.asset?.url) as string;
      if (!url) throw new Error("No image URL returned.");

      setGenerated((prev) => [url, ...prev]);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        setImgObj(img);
        setImgLoading(false);
      };
      img.src = url;
      toast.success("Generated!");
    } catch (e) {
      console.error(e);
      toast.error("Generation failed");
      setImgLoading(false);
    } finally {
      setGenBusy(false);
    }
  }

  // fit-to-container preview
  const stageBoxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!stageBoxRef.current) return;
    const el = stageBoxRef.current;
    const measure = () => {
      const cs = getComputedStyle(el);
      const px = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const py = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      setBox({
        w: Math.max(0, el.clientWidth - px - 8),
        h: Math.max(0, el.clientHeight - py - 8),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const fitScale = useMemo(() => {
    if (!box.w || !box.h) return 1;
    return Math.min(box.w / preset.width, box.h / preset.height);
  }, [box.w, box.h, preset.width, preset.height]);

  const PREVIEW_MAX = 1600;
  const capScale = useMemo(() => {
    const longest = Math.max(preset.width, preset.height);
    return Math.min(1, PREVIEW_MAX / longest);
  }, [preset.width, preset.height]);

  // zoom
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 1;
  const ZOOM_STEP = 0.1;
  const [zoom, setZoom] = useState(0.5);

  const zoomIn = () =>
    setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
  const zoomOut = () =>
    setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
  const resetZoom = () => setZoom(0.5);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      const tag = tgt?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tgt?.isContentEditable)
        return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        zoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        resetZoom();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const s = useMemo(() => {
    const base = Math.min(fitScale, capScale);
    const z = Math.min(Math.max(zoom, ZOOM_MIN), ZOOM_MAX);
    return base * z;
  }, [fitScale, capScale, zoom]);

  const stageW = Math.max(1, Math.floor(preset.width * s));
  const stageH = Math.max(1, Math.floor(preset.height * s));

  // export
  const stageRef = useRef<Konva.Stage>(null);
  async function exportPNG() {
    if (!stageRef.current) return;
    const dataURL = stageRef.current.toDataURL({
      mimeType: "image/png",
      pixelRatio: 1 / Math.max(s, 0.001),
    });
    const safe = (project?.title ?? "asset").replace(/[^\w\-]+/g, "_");
    const blob = await (await fetch(dataURL)).blob();
    saveAs(blob, `${safe}_${preset.id}.png`);
  }

  const aspect = preset.width / preset.height;
  const isVeryWide = aspect >= 1.6;
  const isBook = project?.type?.toLowerCase() === "book";

  if (loading) return <div className="p-6">Loading…</div>;
  if (!project) return <div className="p-6">Project not found.</div>;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-x-hidden">
      {/* ====== HEADER (above everything visually) ====== */}
      <div className="relative z-30 h-12 shrink-0 flex items-center px-4 w-full">
        <StepHeader step={step} steps={steps} onChangeAction={setStep} />
      </div>

      {/* ====== CONTENT AREA (must be relative) ====== */}
      <div className="relative flex-1 min-h-0 p-4 pt-2">
        {/* ----- PROMPT OVERLAY: centered within content; docks under header ----- */}
        <div className="absolute inset-0 z-20 pointer-events-none">
          <div
            className="absolute left-1/2 w-[min(100%,80rem)] px-3 transition-all duration-300 ease-out pointer-events-auto"
            style={{
              willChange: "transform, top",
              top: docked ? DOCKED_TOP : "50%",
              transform: docked
                ? "translate(-50%, 0) scale(0.92)"
                : "translate(-50%, -50%) scale(1)",
            }}
          >
            <div
              className={[
                "relative mx-auto transition-all duration-300 ease-out",
                docked ? "max-w-md" : "max-w-3xl",
              ].join(" ")}
            >
              {/* Hidden inputs */}
              <input
                ref={promptDocInputRef}
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                onChange={onPromptDocChange}
              />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onImageChange}
              />

              {/* Prompt card */}
              <Card
                className={[
                  "relative transition-all duration-300 ease-out bg-secondary",
                  // CENTERED: fully opaque; DOCKED: slight fade & clipped height
                  docked
                    ? "h-10 p-0 overflow-hidden opacity-50 rounded-2xl hover:opacity-75 my-3 md:my-1"
                    : "h-auto opacity-100",
                ].join(" ")}
              >
                <textarea
                  ref={promptRef}
                  className={[
                    "w-full bg-transparent border-none outline-none resize-none",
                    "rounded-2xl pl-5 pr-24",
                    docked ? "py-3 text-sm" : "py-2 text-base min-h-[7rem]",
                    "placeholder:text-muted-foreground",
                    "focus:ring-0 focus:outline-none",
                    "whitespace-pre-wrap break-words overflow-hidden",
                    "transition-all duration-300",
                  ].join(" ")}
                  placeholder="Describe what to generate…  (Shift+Enter = newline, Enter = generate)"
                  value={prompt}
                  onFocus={() => {
                    setPromptActive(true); // re-center
                    setTimeout(() => autosize(), 0);
                  }}
                  onBlur={() => setTimeout(() => setPromptActive(false), 120)}
                  onChange={(e) => setPrompt(e.target.value)}
                  onInput={(e) => {
                    if (!docked) autosize(e.currentTarget);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                  rows={docked ? 1 : 4}
                  style={docked ? { height: "2.75rem" } : undefined}
                />

                {/* Actions only when centered */}
                {!docked && (
                  <>
                    {/* Attach bottom-left */}
                    <button
                      type="button"
                      onClick={pickPromptDoc}
                      className="hover:cursor-pointer absolute left-3 bottom-2 inline-flex items-center gap-1 text-xs rounded-full px-2 py-1 border bg-muted/60 hover:bg-muted transition"
                      title="Upload prompt (.txt)"
                      aria-label="Upload prompt"
                    >
                      <Paperclip className="h-3 w-3" />
                      Attach
                    </button>

                    {/* Submit bottom-right */}
                    <Button
                      type="button"
                      size="sm"
                      className={[
                        "absolute right-3 bottom-2 rounded-full",
                        !prompt.trim() ? "" : "hover:cursor-pointer",
                      ].join(" ")}
                      onClick={handleGenerate}
                      disabled={genBusy || !prompt.trim()}
                      title="Generate"
                    >
                      {genBusy ? (
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

              {/* Badge only when centered */}
              {!docked && promptDocName && (
                <div className="mt-1">
                  <Badge variant="secondary">{promptDocName}</Badge>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ----- CANVAS AREA ----- */}
        <div className="absolute inset-0 pt-16 md:pt-14">
          {/* Blur/dim the canvas only while prompt is focused */}
          <div
            className={[
              "relative h-full w-full transition-all duration-300",
              started && promptActive ? "blur-[2px] opacity-70" : "",
            ].join(" ")}
          >
            <div
              ref={stageBoxRef}
              className="h-full w-full grid place-items-center"
            >
              {/* Skeleton while waiting for image or loading */}
              {showCanvas && (!hasArt || imgLoading) && (
                <div
                  className="inline-block rounded-sm border shadow-sm animate-pulse bg-muted/30"
                  style={{
                    width: Math.max(stageW, 240),
                    height: Math.max(stageH, 160),
                    lineHeight: 0,
                  }}
                >
                  <div className="h-full w-full p-4">
                    <div className="h-full w-full rounded bg-muted/50" />
                  </div>
                </div>
              )}

              {/* Stage */}
              {showCanvas && hasArt && !imgLoading && (
                <div
                  className="inline-block border rounded-sm shadow-sm"
                  style={{ lineHeight: 0 }}
                >
                  <Stage width={stageW} height={stageH} ref={stageRef}>
                    <Layer scaleX={s} scaleY={s}>
                      <Rect
                        x={0}
                        y={0}
                        width={preset.width}
                        height={preset.height}
                        fill="#000"
                      />
                      {imgObj && (
                        <KonvaImage
                          image={imgObj}
                          x={imgX}
                          y={imgY}
                          scaleX={imgScale}
                          scaleY={imgScale}
                          draggable={step !== "export"}
                          onDragEnd={(e) => {
                            setImgX(e.target.x());
                            setImgY(e.target.y());
                          }}
                        />
                      )}
                      {step !== "image" && (
                        <>
                          <KonvaText
                            text={title}
                            fill={textColor}
                            fontSize={Math.round(preset.height * 0.12)}
                            fontStyle="bold"
                            x={Math.round(preset.width * 0.06)}
                            y={Math.round(preset.height * 0.08)}
                            width={Math.round(preset.width * 0.88)}
                            align="center"
                            listening={false}
                          />
                          {!!subtitle && (
                            <KonvaText
                              text={subtitle}
                              fill={textColor}
                              fontSize={Math.round(preset.height * 0.06)}
                              x={Math.round(preset.width * 0.08)}
                              y={Math.round(preset.height * 0.28)}
                              width={Math.round(preset.width * 0.84)}
                              align="center"
                              listening={false}
                            />
                          )}
                          <KonvaText
                            text={author}
                            fill={textColor}
                            fontSize={Math.round(preset.height * 0.05)}
                            x={Math.round(preset.width * 0.1)}
                            y={Math.round(preset.height * 0.85)}
                            width={Math.round(preset.width * 0.8)}
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

            {/* Zoom controls */}
            {showCanvas && hasArt && !imgLoading && (
              <div
                className={[
                  "pointer-events-auto z-10 transition-all duration-300 ease-out",
                  isVeryWide
                    ? "absolute top-3 left-3 flex flex-row items-center gap-1.5"
                    : "absolute left-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1.5",
                ].join(" ")}
              >
                <Button
                  variant="outline"
                  className="rounded-full"
                  size="icon"
                  onClick={zoomOut}
                  aria-label="Zoom out"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="px-2 py-1 rounded-xl text-xs bg-background/80 border tabular-nums">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  variant="outline"
                  className="rounded-full"
                  size="icon"
                  onClick={zoomIn}
                  aria-label="Zoom in"
                >
                  <PlusIcon className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={resetZoom}>
                  Reset
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Bottom utility row */}
        {showCanvas && hasArt && !imgLoading && (
          <div className="absolute bottom-2 inset-x-3 flex items-center justify-between text-xs text-muted-foreground">
            <div className="truncate">
              {preset.label} • {preset.width}×{preset.height}px
            </div>
            <div className="flex items-center gap-2">
              {step === "type" && (
                <div className="w-48">
                  <PresetSelector
                    value={presetId}
                    onValueChangeAction={setPresetId}
                  />
                </div>
              )}
              {step === "export" && (
                <Button size="sm" onClick={exportPNG}>
                  Export PNG
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
