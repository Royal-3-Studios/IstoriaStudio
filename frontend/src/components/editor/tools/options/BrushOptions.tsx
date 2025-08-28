// =============================================================
// src/components/editor/tools/options/BrushOptions.tsx
// =============================================================
"use client";

import * as React from "react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Block } from "./CommonBlocks";
import {
  type ToolOptions,
  type StrokeStyle,
  type BrushStyle,
} from "../../types";
import { Droplets, Pipette, Sparkles } from "lucide-react";

/* --------------------------------- utils --------------------------------- */

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
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
  "#8e44ad",
  "#f368e0",
  "#fd79a8",
];
const PRESET_SIZES = [2, 3, 7, 10] as const;

type RGB = { r: number; g: number; b: number; a?: number };
type HSV = { h: number; s: number; v: number };

function hexToRgb(hex: string): RGB | null {
  const s = hex.trim().replace("#", "");
  if (![3, 6].includes(s.length)) return null;
  const short = s.length === 3;
  const r = parseInt(short ? s[0] + s[0] : s.slice(0, 2), 16);
  const g = parseInt(short ? s[1] + s[1] : s.slice(2, 4), 16);
  const b = parseInt(short ? s[2] + s[2] : s.slice(4, 6), 16);
  return { r, g, b, a: 1 };
}
function rgbToHex({ r, g, b }: RGB): string {
  const p = (n: number) => n.toString(16).padStart(2, "0");
  return `#${p(clamp(Math.round(r), 0, 255))}${p(clamp(Math.round(g), 0, 255))}${p(clamp(Math.round(b), 0, 255))}`;
}
function rgbToHsv({ r, g, b }: RGB): HSV {
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn),
    min = Math.min(rn, gn, bn),
    d = max - min;
  let h = 0;
  if (d) {
    switch (max) {
      case rn:
        h = ((gn - bn) / d) % 6;
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max,
    v = max;
  return { h, s, v };
}
function hsvToRgb({ h, s, v }: HSV): RGB {
  const c = v * s,
    x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
    m = v - c;
  let rn = 0,
    gn = 0,
    bn = 0;
  if (h < 60) [rn, gn, bn] = [c, x, 0];
  else if (h < 120) [rn, gn, bn] = [x, c, 0];
  else if (h < 180) [rn, gn, bn] = [0, c, x];
  else if (h < 240) [rn, gn, bn] = [0, x, c];
  else if (h < 300) [rn, gn, bn] = [x, 0, c];
  else [rn, gn, bn] = [c, 0, x];
  return {
    r: Math.round((rn + m) * 255),
    g: Math.round((gn + m) * 255),
    b: Math.round((bn + m) * 255),
    a: 1,
  };
}
function parseRgbString(s: string): RGB | null {
  const parts = s.split(",").map((t) => Number(t.trim()));
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [r, g, b, a] = parts;
  return {
    r: clamp(Math.round(r), 0, 255),
    g: clamp(Math.round(g), 0, 255),
    b: clamp(Math.round(b), 0, 255),
    a: a === undefined ? 1 : clamp(a, 0, 1),
  };
}

/* --------------------------------- atoms --------------------------------- */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs text-muted-foreground whitespace-nowrap">
      {children}
    </span>
  );
}
function Range({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  className = "",
  "aria-label": ariaLabel,
  title,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  "aria-label"?: string;
  title?: string;
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
        "h-8 w-36 cursor-pointer appearance-none bg-transparent",
        "[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-muted",
        "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary",
        "[&::-webkit-slider-thumb]:mt-[-6px]",
        "[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-muted",
        "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0",
        className,
      ].join(" ")}
      aria-label={ariaLabel}
      title={title}
    />
  );
}

/* ----------------------------- Color controls ----------------------------- */
/** Simple Hue wheel (ring) you can drag to set H; keep SV in the square. */
function HueWheel({ hue, onHue }: { hue: number; onHue: (h: number) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const size = 160; // responsive-ish; caller can wrap
  const thickness = 18;

  const handle = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = Math.atan2(clientY - cy, clientX - cx); // -PI..PI
    let deg = angle * (180 / Math.PI); // -180..180
    deg = (deg + 360 + 90) % 360; // rotate so 0° is at top
    onHue(Math.round(deg));
  };
  const start = (e: React.MouseEvent | React.TouchEvent) => {
    if ("clientX" in e) handle(e.clientX, e.clientY);
    else handle(e.touches[0]!.clientX, e.touches[0]!.clientY);
    const onMove = (ev: MouseEvent) => handle(ev.clientX, ev.clientY);
    const onTouchMove = (ev: TouchEvent) =>
      handle(ev.touches[0]!.clientX, ev.touches[0]!.clientY);
    const end = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", end);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", end);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", end);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", end);
  };

  const rad = ((hue - 90) * Math.PI) / 180; // inverse of above rotation
  const r = (size - thickness) / 2 + thickness / 2;
  const hx = size / 2 + r * Math.cos(rad);
  const hy = size / 2 + r * Math.sin(rad);

  return (
    <div
      ref={ref}
      onMouseDown={start}
      onTouchStart={start}
      className="relative rounded-full cursor-crosshair mx-auto"
      style={{
        width: size,
        height: size,
        background:
          "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
        WebkitMask: `radial-gradient(transparent ${(size - thickness) / 2}px, #000 ${(size - thickness) / 2}px)`,
        mask: `radial-gradient(transparent ${(size - thickness) / 2}px, #000 ${(size - thickness) / 2}px)`,
      }}
      aria-label="Hue wheel"
      role="slider"
    >
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-white shadow"
        style={{ left: hx, top: hy, background: "transparent" }}
        aria-hidden
      />
    </div>
  );
}

function BrushColorControl({
  value,
  alpha = 100,
  onColor,
  onAlpha,
}: {
  value: string;
  alpha?: number;
  onColor: (hex: string) => void;
  onAlpha: (pct: number) => void;
}) {
  const rgb = useMemo(
    () => hexToRgb(value) ?? { r: 255, g: 255, b: 255 },
    [value]
  );
  const hsv0 = useMemo(() => rgbToHsv(rgb), [rgb]);
  const [h, setH] = useState<number>(hsv0.h);
  const [s, setS] = useState<number>(hsv0.s);
  const [v, setV] = useState<number>(hsv0.v);
  React.useEffect(() => {
    const _ = hexToRgb(value);
    if (_) {
      const { h, s, v } = rgbToHsv(_);
      setH(h);
      setS(s);
      setV(v);
    }
  }, [value]);

  const svRef = useRef<HTMLDivElement | null>(null);
  const currentHex = useMemo(() => rgbToHex(hsvToRgb({ h, s, v })), [h, s, v]);

  const startSvDrag = (e: React.MouseEvent | React.TouchEvent) => {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const move = (x: number, y: number) => {
      const ns = clamp((x - rect.left) / rect.width, 0, 1);
      const nv = clamp(1 - (y - rect.top) / rect.height, 0, 1);
      setS(ns);
      setV(nv);
      onColor(rgbToHex(hsvToRgb({ h, s: ns, v: nv })));
    };
    if ("clientX" in e) move(e.clientX, e.clientY);
    else move(e.touches[0]!.clientX, e.touches[0]!.clientY);
    const mm = (ev: MouseEvent) => move(ev.clientX, ev.clientY);
    const tm = (ev: TouchEvent) =>
      move(ev.touches[0]!.clientX, ev.touches[0]!.clientY);
    const end = () => {
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", end);
      window.removeEventListener("touchmove", tm);
      window.removeEventListener("touchend", end);
    };
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", end);
    window.addEventListener("touchmove", tm, { passive: false });
    window.addEventListener("touchend", end);
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      {/* Quick swatches + open picker */}
      <div className="flex items-center gap-1 flex-wrap">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={`Set ${c}`}
            className="h-6 w-6 rounded-sm border cursor-pointer"
            style={{ backgroundColor: c }}
            onClick={() => onColor(c)}
          />
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="cursor-pointer ml-1">
              <Pipette className="h-4 w-4 mr-1" />
              Pick…
            </Button>
          </PopoverTrigger>
          {/* bump z-index + responsive width */}
          <PopoverContent
            className="z-[2000] w-[min(92vw,360px)] sm:w-80 p-3"
            align="start"
          >
            <div className="space-y-3">
              {/* Hue Wheel */}
              <HueWheel
                hue={h}
                onHue={(nh) => {
                  setH(nh);
                  onColor(rgbToHex(hsvToRgb({ h: nh, s, v })));
                }}
              />

              {/* SV square */}
              <div
                ref={svRef}
                onMouseDown={startSvDrag}
                onTouchStart={startSvDrag}
                className="relative h-40 w-full rounded-md cursor-crosshair"
                style={{
                  background: `linear-gradient(to top, #000, transparent),
                               linear-gradient(to right, #fff, hsl(${Math.round(h)},100%,50%))`,
                }}
                aria-label="Saturation/Value"
                role="slider"
              >
                <div
                  className="absolute h-3 w-3 -mt-1.5 -ml-1.5 rounded-full border-2 border-white shadow"
                  style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }}
                />
              </div>

              {/* Alpha */}
              <div className="flex items-center gap-2">
                <FieldLabel>Alpha</FieldLabel>
                <Range
                  value={alpha}
                  onChange={(n) => onAlpha(clamp(n, 0, 100))}
                  min={0}
                  max={100}
                  step={1}
                  aria-label="Alpha"
                />
                <span className="text-xs tabular-nums w-8 text-right">
                  {alpha}%
                </span>
              </div>

              {/* Inputs */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <FieldLabel>HEX</FieldLabel>
                  <Input
                    value={currentHex}
                    onChange={(e) => {
                      const rgb = hexToRgb(e.target.value.trim());
                      if (rgb) onColor(rgbToHex(rgb));
                    }}
                    className="h-8"
                  />
                </div>
                <div className="col-span-2">
                  <FieldLabel>RGB (r,g,b[,a])</FieldLabel>
                  <Input
                    placeholder="255, 0, 128, 1"
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      const rgb = parseRgbString(
                        (e.target as HTMLInputElement).value.trim()
                      );
                      if (rgb) {
                        onColor(rgbToHex(rgb));
                        if (rgb.a !== undefined)
                          onAlpha(Math.round(rgb.a * 100));
                      }
                    }}
                    className="h-8"
                  />
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

/* ------------------------------ Size previews ----------------------------- */

function dashArrayFor(style: StrokeStyle | "solid"): string | undefined {
  return style === "dashed" ? "12 10" : style === "dotted" ? "0 16" : undefined;
}
function sizePreviewPath({
  brushStyle,
  strokeStyle,
  color,
  size,
}: {
  brushStyle: BrushStyle | "solid";
  strokeStyle: StrokeStyle | "solid";
  color: string;
  size: number;
}): React.ReactNode {
  const dash = dashArrayFor(strokeStyle);
  if (brushStyle === "spray") {
    const dots: React.ReactNode[] = [];
    for (let i = 0; i < 22; i++) {
      const t = i / 21;
      // gate dots to imply dashed/dotted
      const on =
        strokeStyle === "solid" ||
        (strokeStyle === "dashed"
          ? i % 6 < 4
          : strokeStyle === "dotted"
            ? i % 6 === 2
            : true);
      if (!on) continue;
      const x = 8 + 96 * t;
      const y = 52 - 40 * t * (0.8 + 0.2 * Math.sin(t * 6.28));
      const r = Math.max(0.5, (size / 2) * 0.18);
      dots.push(
        <circle key={i} cx={x} cy={y} r={r} fill={color} opacity={0.7} />
      );
    }
    return <>{dots}</>;
  }
  if (brushStyle === "pencil") {
    return (
      <>
        <path
          d="M8 52 C 32 28, 64 28, 104 12"
          fill="none"
          stroke={color}
          strokeWidth={Math.max(1, size * 0.6)}
          strokeLinecap="round"
          strokeDasharray={dash}
          opacity={0.9}
        />
        {Array.from({ length: 10 }).map((_, i) => (
          <line
            key={i}
            x1={10 + i * 10}
            y1={54}
            x2={14 + i * 10}
            y2={50}
            stroke={color}
            strokeWidth={0.8}
            opacity={0.2}
          />
        ))}
      </>
    );
  }
  if (brushStyle === "calligraphy") {
    return (
      <>
        <path
          d="M8 52 C 32 28, 64 28, 104 12"
          fill="none"
          stroke={color}
          strokeWidth={size * 1.1}
          strokeLinecap="butt"
          strokeDasharray={dash}
          opacity={0.95}
        />
        <path
          d="M8 56 C 32 32, 64 32, 104 16"
          fill="none"
          stroke={color}
          strokeWidth={size * 0.6}
          strokeLinecap="butt"
          strokeDasharray={dash}
          opacity={0.75}
        />
      </>
    );
  }
  if (brushStyle === "marker") {
    return (
      <path
        d="M8 52 C 32 28, 64 28, 104 12"
        fill="none"
        stroke={color}
        strokeWidth={size * 1.4}
        strokeLinecap="round"
        strokeDasharray={dash}
        opacity={0.9}
      />
    );
  }
  return (
    <path
      d="M8 52 C 32 28, 64 28, 104 12"
      fill="none"
      stroke={color}
      strokeWidth={size}
      strokeLinecap="round"
      strokeDasharray={dash}
    />
  );
}

function SizePreviewCard({
  size,
  color,
  strokeStyle,
  brushStyle,
  selected,
  onSelect,
}: {
  size: number;
  color: string;
  strokeStyle: StrokeStyle | "solid";
  brushStyle: BrushStyle | "solid";
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "relative w-24 h-16 rounded-md border bg-card transition cursor-pointer",
        selected ? "ring-2 ring-ring" : "hover:bg-accent",
      ].join(" ")}
      title={`${size}px`}
      aria-pressed={selected}
    >
      <svg
        viewBox="0 0 96 64"
        width="96"
        height="64"
        className="absolute inset-0"
      >
        <circle cx="12" cy="12" r={Math.max(1, size / 2)} fill={color} />
        {sizePreviewPath({ brushStyle, strokeStyle, color, size })}
      </svg>
      <span className="absolute bottom-1 right-1 text-[10px] text-muted-foreground">
        {size}px
      </span>
    </button>
  );
}
function CustomSizeCard({
  size,
  color,
  strokeStyle,
  brushStyle,
  onSize,
}: {
  size: number;
  color: string;
  strokeStyle: StrokeStyle | "solid";
  brushStyle: BrushStyle | "solid";
  onSize: (n: number) => void;
}) {
  const s = clamp(size, 1, 200);
  return (
    <div
      className="row-span-2 w-24 h-[160px] rounded-md border bg-card p-2 flex flex-col justify-between"
      title="Custom size"
    >
      <div className="relative flex-1">
        <svg viewBox="0 0 96 96" className="absolute inset-0">
          <circle cx="12" cy="12" r={Math.max(1, s / 2)} fill={color} />
          {sizePreviewPath({ brushStyle, strokeStyle, color, size: s })}
        </svg>
        <span className="absolute bottom-1 right-1 text-[10px] text-muted-foreground">
          {s}px
        </span>
      </div>
      <Range
        value={s}
        onChange={(n) => onSize(clamp(n, 1, 200))}
        min={1}
        max={200}
        step={1}
        aria-label="Custom size"
      />
    </div>
  );
}

/* -------------------------- Style selects with preview -------------------------- */

function StylePreviewRow({
  label,
  brushStyle,
  strokeStyle,
  color,
  size,
}: {
  label: string;
  brushStyle: BrushStyle | "solid";
  strokeStyle: StrokeStyle | "solid";
  color: string;
  size: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs w-20">{label}</span>
      <svg viewBox="0 0 120 16" width="120" height="16">
        {sizePreviewPath({ brushStyle, strokeStyle, color, size })}
      </svg>
    </div>
  );
}

/* ----------------------------------- main ---------------------------------- */

export function BrushOptions({
  options,
  onChangeAction,
}: {
  options: Partial<ToolOptions>;
  onChangeAction: (patch: Partial<ToolOptions>) => void;
}) {
  const stroke = options.stroke ?? "#ffffff";
  const strokeWidth = options.strokeWidth ?? 8;
  const strokeStyle = (options.strokeStyle ?? "solid") as StrokeStyle;
  const brushStyle = (options.brushStyle ?? "solid") as BrushStyle;
  const alpha = options.alpha ?? 100;

  return (
    <div className="flex flex-col gap-4">
      {/* Color */}
      <div className="flex items-start gap-3 flex-wrap">
        <Block title="Color">
          <BrushColorControl
            value={stroke}
            alpha={alpha}
            onColor={(hex) => onChangeAction({ stroke: hex })}
            onAlpha={(pct) => onChangeAction({ alpha: pct })}
          />
        </Block>
      </div>

      {/* Size + advanced */}
      <div className="flex items-start gap-4 flex-wrap">
        <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 gap-2">
          <CustomSizeCard
            size={strokeWidth}
            color={stroke}
            strokeStyle={strokeStyle}
            brushStyle={brushStyle}
            onSize={(n) => onChangeAction({ strokeWidth: n })}
          />
          {PRESET_SIZES.map((s, idx) => (
            <SizePreviewCard
              key={`${s}-${idx}`}
              size={s}
              color={stroke}
              strokeStyle={strokeStyle}
              brushStyle={brushStyle}
              selected={s === strokeWidth}
              onSelect={() => onChangeAction({ strokeWidth: s })}
            />
          ))}
        </div>

        {/* Extended tuning */}
        <div className="flex flex-col gap-2 min-w-[220px]">
          <div className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5">
            <FieldLabel>Hardness</FieldLabel>
            <Range
              value={options.hardness ?? 80}
              onChange={(n) => onChangeAction({ hardness: n })}
              min={0}
              max={100}
            />
            <span className="text-xs tabular-nums w-8 text-right">
              {options.hardness ?? 80}%
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5">
            <FieldLabel>Spacing</FieldLabel>
            <Range
              value={options.spacing ?? 25}
              onChange={(n) => onChangeAction({ spacing: n })}
              min={1}
              max={100}
            />
            <span className="text-xs tabular-nums w-8 text-right">
              {options.spacing ?? 25}%
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5">
            <FieldLabel>Flow</FieldLabel>
            <Range
              value={options.flow ?? 100}
              onChange={(n) => onChangeAction({ flow: n })}
              min={1}
              max={100}
            />
            <span className="text-xs tabular-nums w-8 text-right">
              {options.flow ?? 100}%
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5">
            <FieldLabel>Smoothing</FieldLabel>
            <Range
              value={options.smoothing ?? 20}
              onChange={(n) => onChangeAction({ smoothing: n })}
              min={0}
              max={100}
            />
            <span className="text-xs tabular-nums w-8 text-right">
              {options.smoothing ?? 20}%
            </span>
          </div>
          <label className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={options.pressure ?? true}
              onChange={(e) =>
                onChangeAction({ pressure: Boolean(e.target.checked) })
              }
              className="cursor-pointer"
            />
            <FieldLabel>Pressure sensitivity</FieldLabel>
            <Droplets className="h-4 w-4 opacity-70" />
          </label>
        </div>
      </div>

      {/* Dual style selects */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <FieldLabel>Style</FieldLabel>
          <Sparkles className="h-4 w-4 opacity-70" />
        </div>

        {/* Brush engine */}
        <div className="flex items-center gap-2 flex-wrap">
          <FieldLabel>Brush engine</FieldLabel>
          <Select
            value={brushStyle}
            onValueChange={(v) =>
              onChangeAction({ brushStyle: v as BrushStyle })
            }
          >
            <SelectTrigger className="w-56 cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            {/* raise z-index so it renders above overlay */}
            <SelectContent className="z-[2000]">
              {(
                ["solid", "marker", "calligraphy", "spray", "pencil"] as const
              ).map((k) => (
                <SelectItem key={k} value={k}>
                  <StylePreviewRow
                    label={k[0].toUpperCase() + k.slice(1)}
                    brushStyle={k}
                    strokeStyle={strokeStyle}
                    color={stroke}
                    size={strokeWidth}
                  />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Stroke pattern */}
        <div className="flex items-center gap-2 flex-wrap">
          <FieldLabel>Stroke pattern</FieldLabel>
          <Select
            value={strokeStyle}
            onValueChange={(v) =>
              onChangeAction({ strokeStyle: v as StrokeStyle })
            }
          >
            <SelectTrigger className="w-56 cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[2000]">
              {(["solid", "dashed", "dotted"] as const).map((k) => (
                <SelectItem key={k} value={k}>
                  <StylePreviewRow
                    label={k[0].toUpperCase() + k.slice(1)}
                    brushStyle={brushStyle}
                    strokeStyle={k}
                    color={stroke}
                    size={strokeWidth}
                  />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
