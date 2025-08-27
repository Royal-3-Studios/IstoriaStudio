// src/components/editor/EditorTooling.tsx
"use client";

import * as React from "react";
import {
  Hand,
  MousePointer2 as SelectIcon,
  Crop,
  Brush,
  Eraser,
  PaintBucket,
  Pipette,
  Type as TypeIcon,
  Shapes,
  Minus as LineIcon,
  PenTool,
  Stamp,
  Droplet,
  Palette,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

/* =============================================================
   Public types
   ============================================================= */
export type ToolId =
  | "move"
  | "select"
  | "crop"
  | "brush"
  | "eraser"
  | "fill"
  | "gradient"
  | "clone"
  | "smudge"
  | "text"
  | "shape"
  | "line"
  | "pen"
  | "eyedropper";

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten";

export type StrokeStyle = "solid" | "dashed" | "dotted";
export type LineCap = "butt" | "round" | "square";
export type LineJoin = "miter" | "round" | "bevel";
export type TextAlignX = "left" | "center" | "right" | "justify";

export type BooleanOp = "union" | "subtract" | "intersect" | "exclude";
export type PathAlign =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom";

export interface ToolOptions {
  // common
  stroke?: string; // hex or rgba
  strokeWidth?: number; // px
  strokeStyle?: StrokeStyle;
  fill?: string; // hex or rgba
  opacity?: number; // 0..100
  blendMode?: BlendMode;

  // text
  fontFamily?: string;
  fontSize?: number; // px
  fontWeight?: number; // 100..900
  textAlign?: TextAlignX;

  // path/line
  lineCap?: LineCap;
  lineJoin?: LineJoin;
}

/* =============================================================
   Icons + metadata
   ============================================================= */
const TOOL_META: Record<
  ToolId,
  { label: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }
> = {
  move: { label: "Move", icon: Hand },
  select: { label: "Select", icon: SelectIcon },
  crop: { label: "Crop", icon: Crop },
  brush: { label: "Brush", icon: Brush },
  eraser: { label: "Eraser", icon: Eraser },
  fill: { label: "Fill", icon: PaintBucket },
  gradient: { label: "Gradient", icon: Palette },
  clone: { label: "Clone/Stamp", icon: Stamp },
  smudge: { label: "Smudge/Blur", icon: Droplet },
  text: { label: "Text", icon: TypeIcon },
  shape: { label: "Shape", icon: Shapes },
  line: { label: "Line", icon: LineIcon },
  pen: { label: "Pen", icon: PenTool },
  eyedropper: { label: "Eyedropper", icon: Pipette },
};

export const ALL_TOOLS: ToolId[] = [
  "move",
  "select",
  "crop",
  "brush",
  "eraser",
  "fill",
  "gradient",
  "clone",
  "smudge",
  "text",
  "shape",
  "line",
  "pen",
  "eyedropper",
];

export const getToolLabel = (id: ToolId | null) =>
  id ? TOOL_META[id].label : "";

/* =============================================================
   Toolbar (tool picker) — click toggles options dock
   ============================================================= */
export function ToolsToolbar({
  tool,
  open,
  onToggle,
  orientation = "horizontal",
  compact = false,
  className,
}: {
  tool: ToolId | null;
  open: boolean;
  onToggle: (next: ToolId) => void; // clicking same tool toggles dock open/close
  orientation?: "horizontal" | "vertical";
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={[
        "flex flex-wrap gap-1",
        orientation === "vertical" ? "flex-col" : "items-center",
        className ?? "",
      ].join(" ")}
      role="toolbar"
      aria-label="Drawing tools"
    >
      {ALL_TOOLS.map((id) => {
        const { label, icon: Icon } = TOOL_META[id];
        const active = tool === id;
        return (
          <Button
            key={id}
            type="button"
            variant={active ? "secondary" : "ghost"}
            size="icon"
            aria-pressed={active}
            aria-expanded={active ? open : false}
            title={label}
            onClick={() => onToggle(id)}
            className={(compact ? "h-8 w-8" : "h-9 w-9") + " cursor-pointer"}
          >
            <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} />
          </Button>
        );
      })}
    </div>
  );
}

/* =============================================================
   Options Dock — full-width panel that appears below toolbar
   ============================================================= */
export function ToolOptionsDock({
  open,
  tool,
  options,
  onChange,
  onClose,
  onBooleanOp,
  onPathAlign,
  className,
}: {
  open: boolean;
  tool: ToolId | null;
  options: Partial<ToolOptions>;
  onChange: (patch: Partial<ToolOptions>) => void;
  onClose: () => void;
  onBooleanOp?: (op: BooleanOp) => void;
  onPathAlign?: (align: PathAlign) => void;
  className?: string;
}) {
  if (!open || !tool) return null;
  const label = getToolLabel(tool);

  return (
    <div
      className={[
        "mt-1 w-full rounded-md border bg-card/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card",
        "animate-in fade-in slide-in-from-top-1 duration-150",
        className ?? "",
      ].join(" ")}
    >
      {/* header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <span className="text-xs font-medium text-muted-foreground">
          {label} options
        </span>
        <div className="ml-auto flex items-center gap-3">
          {/* Live preview chip for some tools */}
          {tool === "brush" && (
            <BrushPreview
              color={options.stroke ?? "#ffffff"}
              size={options.strokeWidth ?? 8}
            />
          )}
          {tool === "line" && (
            <LinePreview
              color={options.stroke ?? "#ffffff"}
              width={options.strokeWidth ?? 2}
            />
          )}
          {tool === "text" && (
            <TextPreview
              color={options.fill ?? "#ffffff"}
              fontFamily={options.fontFamily ?? "Inter"}
              fontSize={options.fontSize ?? 24}
              fontWeight={options.fontWeight ?? 600}
            />
          )}
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            className="h-8 w-8 cursor-pointer"
            aria-label="Close tool options"
            title="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* body: reuse the detailed options bar, but inside the dock */}
      <div className="px-3 py-2">
        <ToolOptionsBar
          tool={tool}
          options={options}
          onChange={onChange}
          onBooleanOp={onBooleanOp}
          onPathAlign={onPathAlign}
        />
      </div>
    </div>
  );
}

/* =============================================================
   Tool options (contextual)
   ============================================================= */
export function ToolOptionsBar({
  tool,
  options,
  onChange,
  onBooleanOp,
  onPathAlign,
  className,
}: {
  tool: ToolId;
  options: Partial<ToolOptions>;
  onChange: (patch: Partial<ToolOptions>) => void;
  onBooleanOp?: (op: BooleanOp) => void;
  onPathAlign?: (align: PathAlign) => void;
  className?: string;
}) {
  return (
    <div
      className={["flex flex-wrap items-center gap-2", className ?? ""].join(
        " "
      )}
    >
      {/* Common for many tools */}
      {showsStrokeBlock(tool) && (
        <Block title="Stroke">
          <ColorField
            value={options.stroke ?? "#ffffff"}
            onChange={(v) => onChange({ stroke: v })}
          />
          <NumberField
            label="W"
            value={options.strokeWidth ?? 2}
            min={0}
            max={200}
            step={1}
            onChange={(n) => onChange({ strokeWidth: n })}
            className="w-20"
          />
          <SelectField
            label="Style"
            value={options.strokeStyle ?? "solid"}
            onChange={(v) => onChange({ strokeStyle: v as StrokeStyle })}
            options={[
              { label: "Solid", value: "solid" },
              { label: "Dashed", value: "dashed" },
              { label: "Dotted", value: "dotted" },
            ]}
          />
        </Block>
      )}

      {showsFillBlock(tool) && (
        <Block title="Fill">
          <ColorField
            value={options.fill ?? "#000000"}
            onChange={(v) => onChange({ fill: v })}
          />
        </Block>
      )}

      {showsOpacityBlock(tool) && (
        <Block title="Opacity">
          <RangeField
            value={options.opacity ?? 100}
            min={0}
            max={100}
            step={1}
            onChange={(n) => onChange({ opacity: n })}
            className="w-32"
          />
        </Block>
      )}

      {showsBlendBlock(tool) && (
        <Block title="Blend">
          <SelectField
            value={options.blendMode ?? "normal"}
            onChange={(v) => onChange({ blendMode: v as BlendMode })}
            options={[
              { label: "Normal", value: "normal" },
              { label: "Multiply", value: "multiply" },
              { label: "Screen", value: "screen" },
              { label: "Overlay", value: "overlay" },
              { label: "Darken", value: "darken" },
              { label: "Lighten", value: "lighten" },
            ]}
          />
        </Block>
      )}

      {/* Text tool */}
      {tool === "text" && (
        <>
          <Block title="Font">
            <Input
              placeholder="Font family"
              value={options.fontFamily ?? "Inter"}
              onChange={(e) => onChange({ fontFamily: e.target.value })}
              className="h-8 w-40"
            />
            <NumberField
              label="Size"
              value={options.fontSize ?? 48}
              min={4}
              max={512}
              step={1}
              onChange={(n) => onChange({ fontSize: n })}
              className="w-24"
            />
            <NumberField
              label="Weight"
              value={options.fontWeight ?? 600}
              min={100}
              max={900}
              step={100}
              onChange={(n) => onChange({ fontWeight: n })}
              className="w-28"
            />
          </Block>
          <Block title="Align">
            <SelectField
              value={options.textAlign ?? "left"}
              onChange={(v) => onChange({ textAlign: v as TextAlignX })}
              options={[
                { label: "Left", value: "left" },
                { label: "Center", value: "center" },
                { label: "Right", value: "right" },
                { label: "Justify", value: "justify" },
              ]}
            />
          </Block>
        </>
      )}

      {/* Vector-specific */}
      {(tool === "line" || tool === "pen" || tool === "shape") && (
        <>
          <Block title="Line caps">
            <SelectField
              value={options.lineCap ?? "round"}
              onChange={(v) => onChange({ lineCap: v as LineCap })}
              options={[
                { label: "Butt", value: "butt" },
                { label: "Round", value: "round" },
                { label: "Square", value: "square" },
              ]}
            />
          </Block>
          <Block title="Line joins">
            <SelectField
              value={options.lineJoin ?? "round"}
              onChange={(v) => onChange({ lineJoin: v as LineJoin })}
              options={[
                { label: "Miter", value: "miter" },
                { label: "Round", value: "round" },
                { label: "Bevel", value: "bevel" },
              ]}
            />
          </Block>
          {onBooleanOp && (
            <Block title="Boolean">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onBooleanOp("union")}
                className="cursor-pointer"
              >
                Union
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onBooleanOp("subtract")}
                className="cursor-pointer"
              >
                Subtract
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onBooleanOp("intersect")}
                className="cursor-pointer"
              >
                Intersect
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onBooleanOp("exclude")}
                className="cursor-pointer"
              >
                Exclude
              </Button>
            </Block>
          )}
          {onPathAlign && (
            <Block title="Align">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onPathAlign("left")}
                className="cursor-pointer"
              >
                Left
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onPathAlign("center")}
                className="cursor-pointer"
              >
                Center
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onPathAlign("right")}
                className="cursor-pointer"
              >
                Right
              </Button>
              <Separator orientation="vertical" className="mx-1 h-6" />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onPathAlign("top")}
                className="cursor-pointer"
              >
                Top
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onPathAlign("middle")}
                className="cursor-pointer"
              >
                Middle
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onPathAlign("bottom")}
                className="cursor-pointer"
              >
                Bottom
              </Button>
            </Block>
          )}
        </>
      )}

      {/* space filler */}
      <div className="grow" />
    </div>
  );
}

/* =============================================================
   Live previews
   ============================================================= */
function BrushPreview({ color, size }: { color: string; size: number }) {
  const s = Math.max(4, Math.min(64, size));
  return (
    <div className="flex items-center gap-2" title={`Brush size ${size}px`}>
      <span className="text-xs text-muted-foreground">Preview</span>
      <div className="h-6 w-16 rounded-full bg-muted/60 flex items-center justify-center">
        <div
          className="rounded-full"
          style={{ width: s, height: s, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function LinePreview({ color, width }: { color: string; width: number }) {
  const w = Math.max(1, Math.min(12, width));
  return (
    <div className="flex items-center gap-2" title={`Stroke ${width}px`}>
      <span className="text-xs text-muted-foreground">Preview</span>
      <div className="h-6 w-16 rounded-full bg-muted/60 flex items-center justify-center">
        <div className="w-12" style={{ height: w, backgroundColor: color }} />
      </div>
    </div>
  );
}

function TextPreview({
  color,
  fontFamily,
  fontSize,
  fontWeight,
}: {
  color: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
}) {
  return (
    <div className="flex items-center gap-2" title="Text preview">
      <span className="text-xs text-muted-foreground">Preview</span>
      <div className="h-6 w-20 rounded bg-muted/60 flex items-center justify-center">
        <span style={{ color, fontFamily, fontSize, fontWeight }}>Ag</span>
      </div>
    </div>
  );
}

/* =============================================================
   Helpers: which blocks show for which tool
   ============================================================= */
function showsStrokeBlock(tool: ToolId) {
  return ["select", "brush", "eraser", "shape", "line", "pen", "text"].includes(
    tool
  );
}
function showsFillBlock(tool: ToolId) {
  return ["fill", "shape", "text", "gradient", "clone", "smudge"].includes(
    tool
  );
}
function showsOpacityBlock(tool: ToolId) {
  return [
    "brush",
    "eraser",
    "fill",
    "gradient",
    "clone",
    "smudge",
    "text",
    "shape",
    "line",
    "pen",
  ].includes(tool);
}
function showsBlendBlock(tool: ToolId) {
  return [
    "brush",
    "fill",
    "gradient",
    "clone",
    "smudge",
    "text",
    "shape",
    "line",
    "pen",
  ].includes(tool);
}

/* =============================================================
   UI primitives used inside options bar
   ============================================================= */
function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5">
      <span className="text-xs text-muted-foreground mr-1 whitespace-nowrap">
        {title}
      </span>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 1000,
  step = 1,
  className,
}: {
  label?: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
      <Input
        type="number"
        value={Number.isFinite(value) ? String(value) : ""}
        onChange={(e) => onChange(Number(e.target.value || 0))}
        min={min}
        max={max}
        step={step}
        className={["h-8 w-16", className ?? ""].join(" ")}
      />
    </div>
  );
}

function RangeField({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  className,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={[
        "h-8 w-28 cursor-pointer appearance-none bg-transparent",
        "[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-muted",
        "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary",
        className ?? "",
      ].join(" ")}
    />
  );
}

function ColorField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const SWATCHES = [
    "#000000",
    "#ffffff",
    "#ff4757",
    "#ffa502",
    "#ffdd59",
    "#2ed573",
    "#1e90ff",
    "#5352ed",
    "#b53471",
  ];
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-8 cursor-pointer rounded-md border p-0"
        aria-label="Pick color"
      />
      <div className="flex items-center gap-1">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={`Set color ${c}`}
            className="h-5 w-5 rounded-sm border cursor-pointer"
            style={{ backgroundColor: c }}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ label: string; value: string }>;
  label?: string;
  className?: string;
}) {
  return (
    <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {label && <span>{label}</span>}
      <select
        className={[
          "h-8 rounded-md border bg-background px-2 text-foreground cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className ?? "",
        ].join(" ")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
