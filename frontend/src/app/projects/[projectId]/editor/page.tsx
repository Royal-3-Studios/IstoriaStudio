"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import type Konva from "konva";
import { useDropzone } from "react-dropzone";
import { saveAs } from "file-saver";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

import StepHeader, { type Step } from "@/components/editor/StepHeader";
import { PRESETS, defaultPresetForProjectType } from "@/data/presets";
import PresetSelector from "@/components/editor/PresetSelector";
import { Loader, Plus, Upload } from "lucide-react";

// Konva (client)
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

type Project = {
  id: string;
  title: string;
  type: string;
  description?: string | null;
};

const presetById = (id: string) =>
  PRESETS.find((p) => p.id === id) ?? PRESETS[0];

export default function ProjectEditorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  // load project
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

  // image + text layers
  const [imgObj, setImgObj] = useState<HTMLImageElement | null>(null);
  const [imgScale, setImgScale] = useState<number>(1);
  const [imgX, setImgX] = useState<number>(0);
  const [imgY, setImgY] = useState<number>(0);

  const [title, setTitle] = useState("Title");
  const [subtitle, setSubtitle] = useState("Subtitle");
  const [author, setAuthor] = useState("Author");
  const [textColor, setTextColor] = useState("#ffffff");

  useEffect(() => {
    if (!project) return;
    setTitle(project.title ?? "Title");
    if (project.description) setSubtitle(project.description);
  }, [project]);

  // generate
  const [prompt, setPrompt] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [generated, setGenerated] = useState<string[]>([]);

  async function handleGenerate() {
    try {
      setGenBusy(true);
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
      img.onload = () => setImgObj(img);
      img.src = url;
      toast.success("Generated!");
    } catch (e) {
      console.error(e);
      toast.error("Generation failed");
    } finally {
      setGenBusy(false);
    }
  }

  // upload
  const onDrop = (files: File[]) => {
    if (!files.length) return;
    const f = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => setImgObj(img);
      img.src = reader.result as string;
      setGenerated((prev) => [reader.result as string, ...prev]);
    };
    reader.readAsDataURL(f);
  };
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
  });

  // ===== Fit-to-container scaling + lightweight preview =====
  const stageBoxRef = useRef<HTMLDivElement>(null); // measure ONLY the empty box under the zoom row
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

  const PREVIEW_MAX = 1600; // longest side in preview pixels
  const capScale = useMemo(() => {
    const longest = Math.max(preset.width, preset.height);
    return Math.min(1, PREVIEW_MAX / longest);
  }, [preset.width, preset.height]);

  // ===== Zoom: start at 50%, with +/- and Reset. Never overflow (max = fit). =====
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 1;
  const ZOOM_STEP = 0.1;
  const [zoom, setZoom] = useState(0.5); // start at the former "50% mark"

  const zoomIn = () =>
    setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
  const zoomOut = () =>
    setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
  const resetZoom = () => setZoom(0.5);

  // Optional keyboard shortcuts: + / - / 0 (ignore while typing in inputs)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }
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

  // final scale (fit * zoom) with cap applied for perf
  const s = useMemo(() => {
    const base = Math.min(fitScale, capScale);
    const z = Math.min(Math.max(zoom, ZOOM_MIN), ZOOM_MAX);
    return base * z;
  }, [fitScale, capScale, zoom]);

  // preview canvas pixel size
  const stageW = Math.max(1, Math.floor(preset.width * s));
  const stageH = Math.max(1, Math.floor(preset.height * s));

  // export exact px (upsample since preview stage is smaller)
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

  const isBook = project?.type?.toLowerCase() === "book";

  if (loading) return <div className="p-6">Loading…</div>;
  if (!project) return <div className="p-6">Project not found.</div>;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Row 1: Steps (fixed height) */}
      <div className="h-12 shrink-0 flex items-center px-4">
        <StepHeader step={step} steps={steps} onChange={setStep} />
      </div>

      {/* Row 2: Step-specific controls (fixed height; scroll internally if needed) */}
      <div className="h-40 md:h-44 lg:h-48 shrink-0 px-4 max-w-full md:p-2">
        <Card className="h-full p-4 overflow-y-auto">
          {step === "image" && (
            <div className="space-y-4">
              <div className="w-full flex flex-col items-center">
                <div className="relative w-full max-w-[800px]">
                  {/* Left: upload (dropzone) */}
                  <div
                    {...getRootProps()}
                    className={`absolute left-1.5 top-1/2 -translate-y-1/2
                  h-6 w-6 rounded-full grid place-items-center
                  border bg-muted/50  transition  hover:bg-primary
                  ${isDragActive ? "ring-2 ring-primary ring-offset-1" : ""}`}
                    title="Upload image"
                    aria-label="Upload image"
                    role="button"
                    tabIndex={0}
                  >
                    <input {...getInputProps()} />
                    <Plus className="h-5 w-5 text-foreground hover:text-background" />
                  </div>

                  {/* Input (room for left/right buttons) */}
                  <Input
                    className="rounded-full w-full pl-11 pr-11"
                    placeholder="Describe what to generate…"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleGenerate();
                      }
                    }}
                  />

                  {/* Right: generate */}
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={genBusy || !prompt.trim()}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2
                 h-6 w-6 rounded-full grid place-items-center
                 border bg-primary/90 hover:bg-primary text-primary-foreground
                 disabled:opacity-50"
                    aria-label="Generate"
                    title="Generate"
                  >
                    {genBusy ? (
                      <Loader className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {/* Optional: show an uploaded prompt file name or hint below */}
                {/* <Badge variant="secondary" className="mt-1">my_prompt.txt</Badge> */}
              </div>

              {!!generated.length && (
                <div>
                  <Label>Generated options</Label>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {generated.map((url, i) => (
                      <button
                        key={`${url}-${i}`}
                        className="border rounded overflow-hidden hover:ring"
                        onClick={() => {
                          const img = new Image();
                          img.crossOrigin = "anonymous";
                          img.onload = () => setImgObj(img);
                          img.src = url;
                        }}
                        title="Apply to canvas"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`option ${i + 1}`}
                          className="block w-full aspect-[2/3] object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === "type" && (
            <div className="space-y-4">
              <PresetSelector
                value={presetId}
                onValueChangeAction={setPresetId}
              />
              <div className="text-xs text-muted-foreground">
                Preview proportions update immediately. Export uses exact preset
                pixels.
              </div>
            </div>
          )}

          {step === "text" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Title</Label>
                <Input
                  className="mt-1"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <Label>Author</Label>
                <Input
                  className="mt-1"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Subtitle</Label>
                <Input
                  className="mt-1"
                  placeholder="Optional"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Text size tweak</Label>
                <Slider
                  className="mt-3"
                  defaultValue={[1]}
                  min={0.8}
                  max={1.2}
                  step={0.01}
                  onValueChange={() => {}}
                />
              </div>
            </div>
          )}

          {step === "layout" && isBook && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Book layout (spine/back) controls will go here.
              </p>
            </div>
          )}

          {step === "export" && (
            <div className="space-y-3 flex flex-col w-full mt-10">
              <Button className="w-full" onClick={exportPNG}>
                Download PNG ({preset.width}×{preset.height})
              </Button>
              <div className="text-xs text-muted-foreground">
                Export is exact pixels regardless of on-screen scale.
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Row 3: Canvas (fills the rest; never changes height) */}
      <div className="flex-1 min-h-0 p-4 pt-2">
        <Card className="h-full p-4 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between text-sm mb-2 gap-4 shrink-0">
            <div>
              {preset.label} • {preset.width}×{preset.height}px (export) —
              preview fits container
            </div>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap">Zoom</span>
              <Button
                variant="outline"
                size="icon"
                onClick={zoomOut}
                aria-label="Zoom out"
              >
                −
              </Button>
              <span className="w-12 text-center tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={zoomIn}
                aria-label="Zoom in"
              >
                +
              </Button>
              <Button variant="ghost" size="sm" onClick={resetZoom}>
                Reset
              </Button>
            </div>
          </div>

          {/* Measure ONLY this box for Stage size */}
          <div
            ref={stageBoxRef}
            className="flex-1 min-h-0 grid place-items-center"
          >
            <div className="inline-block border" style={{ lineHeight: 0 }}>
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
          </div>
        </Card>
      </div>
    </div>
  );
}
