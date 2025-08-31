// =============================================================
// src/components/editor/tools/options/BrushOptions.tsx
// =============================================================
"use client";

import * as React from "react";
import { useMemo, useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type ToolOptions,
  type StrokeStyle,
  type BrushStyle,
} from "../../types";
import { Droplets } from "lucide-react";

/* --------------------------------- utils --------------------------------- */

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

const SWATCHES_2x3 = [
  "#ffffff",
  "#000000",
  "#ff4757",
  "#1e90ff",
  "#ffdd00",
  "#8e44ad",
] as const;

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
  return `#${p(clamp(Math.round(r), 0, 255))}${p(
    clamp(Math.round(g), 0, 255)
  )}${p(clamp(Math.round(b), 0, 255))}`;
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

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[11px] font-medium tracking-wide text-muted-foreground">
      {children}
    </h4>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="!text-[9px] text-muted-foreground whitespace-nowrap">
      {children}
    </span>
  );
}

/** Range now supports widthPx="full" to stretch within layout rows */
function Range({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  widthPx = 130 as number | "full",
  vertical = false,
  className = "",
  "aria-label": ariaLabel,
  title,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  widthPx?: number | "full";
  vertical?: boolean;
  className?: string;
  "aria-label"?: string;
  title?: string;
}) {
  const base = [
    "cursor-pointer appearance-none bg-transparent",
    "[&::-webkit-slider-runnable-track]:bg-muted [&::-webkit-slider-runnable-track]:rounded-full",
    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary",
    "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0",
  ];
  if (!vertical) {
    base.push(
      "h-2",
      "[&::-webkit-slider-runnable-track]:h-1",
      "[&::-webkit-slider-thumb]:mt-[-6px]",
      "[&::-moz-range-track]:h-1"
    );
  } else {
    base.push(
      "w-8 h-40 rotate-[-90deg]",
      "[&::-webkit-slider-runnable-track]:h-1",
      "[&::-webkit-slider-thumb]:mt-[-6px]",
      "[&::-moz-range-track]:h-1"
    );
  }

  const styleWidth = vertical
    ? 160
    : widthPx === "full"
      ? undefined
      : (widthPx as number);

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ width: styleWidth }}
      className={[
        ...base,
        widthPx === "full" && !vertical ? "w-full" : "",
        className,
      ].join(" ")}
      aria-label={ariaLabel}
      title={title}
    />
  );
}

/* ---------- Numeric stepper (used for Alpha) ---------- */

function NumericStepper({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  widthClass = "w-[7rem]",
  ariaLabel,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  widthClass?: string;
  ariaLabel?: string;
}) {
  const commit = (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    onChange(clamp(Math.round(n), min, max));
  };
  return (
    <div className={`flex items-center gap-2 ${widthClass}`}>
      <button
        type="button"
        className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-full border bg-card hover:bg-accent cursor-pointer p-0 leading-none"
        onClick={() => onChange(clamp(value - step, min, max))}
        aria-label="Decrease"
      >
        <span aria-hidden="true" className="-mt-px">
          −
        </span>
      </button>

      <Input
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(clamp(Math.round(n), min, max));
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) =>
          e.key === "Enter" && commit((e.target as HTMLInputElement).value)
        }
        aria-label={ariaLabel ?? "Value"}
        className="h-5 text-center w-10 px-1"
      />

      <button
        type="button"
        className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-full border bg-card hover:bg-accent cursor-pointer p-0 leading-none"
        onClick={() => onChange(clamp(value + step, min, max))}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}

/* ----------------------------- Color controls ----------------------------- */

function VerticalHueSlider({
  hue,
  onChange,
  height = 160,
}: {
  hue: number;
  onChange: (h: number) => void;
  height?: number;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);

  const clampDeg = (d: number) => Math.max(0, Math.min(360, d));
  const handleAt = (clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    onChange(Math.round((1 - t) * 360));
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    if ("clientY" in e) handleAt(e.clientY);
    else handleAt(e.touches[0]!.clientY);
    const mm = (ev: MouseEvent) => handleAt(ev.clientY);
    const tm = (ev: TouchEvent) => handleAt(ev.touches[0]!.clientY);
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

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = 1;
    const big = 10;
    let next = hue;
    switch (e.key) {
      case "ArrowUp":
        next = clampDeg(hue + step);
        break;
      case "ArrowDown":
        next = clampDeg(hue - step);
        break;
      case "PageUp":
        next = clampDeg(hue + big);
        break;
      case "PageDown":
        next = clampDeg(hue - big);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 360;
        break;
      default:
        return;
    }
    e.preventDefault();
    onChange(next);
  };

  const markerTop = `${(1 - hue / 360) * 100}%`;

  return (
    <div
      ref={ref}
      onMouseDown={start}
      onTouchStart={start}
      onKeyDown={onKeyDown}
      tabIndex={0}
      className="relative w-3 rounded-xs cursor-pointer outline-none focus:ring-2 focus:ring-ring ml-[-2px]"
      style={{
        height,
        background:
          "linear-gradient(to top, red, magenta, blue, cyan, lime, yellow, red)",
      }}
      role="slider"
      aria-label="Hue"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(hue)}
      aria-valuetext={`Hue ${Math.round(hue)} degrees`}
    >
      <div
        className="absolute left-1/2 -translate-x-1/2 h-1.5 w-5 rounded-full border border-white bg-white/80 shadow"
        style={{ top: markerTop }}
        aria-hidden
      />
    </div>
  );
}

function SVSquare({
  hue,
  s,
  v,
  onChange,
  size = 160,
}: {
  hue: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
  onChange: (s: number, v: number) => void;
  size?: number;
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);

  const ids = React.useMemo(
    () => ({
      live: `sv-live-${Math.random().toString(36).slice(2)}`,
      help: `sv-help-${Math.random().toString(36).slice(2)}`,
    }),
    []
  );

  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  const setFromClient = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ns = clamp01((clientX - rect.left) / rect.width);
    const nv = clamp01(1 - (clientY - rect.top) / rect.height);
    onChange(ns, nv);
  };

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    if ("clientX" in e) setFromClient(e.clientX, e.clientY);
    else setFromClient(e.touches[0]!.clientX, e.touches[0]!.clientY);
    const mm = (ev: MouseEvent) => setFromClient(ev.clientX, ev.clientY);
    const tm = (ev: TouchEvent) =>
      setFromClient(ev.touches[0]!.clientX, ev.touches[0]!.clientY);
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

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const small = 0.01;
    const big = 0.1;
    const stepS = e.shiftKey ? big : small;
    const stepV = e.shiftKey ? big : small;

    let ns = s;
    let nv = v;
    switch (e.key) {
      case "ArrowLeft":
        ns = clamp01(s - stepS);
        break;
      case "ArrowRight":
        ns = clamp01(s + stepS);
        break;
      case "ArrowDown":
        nv = clamp01(v - stepV);
        break;
      case "ArrowUp":
        nv = clamp01(v + stepV);
        break;
      case "Home":
        ns = 0;
        break;
      case "End":
        ns = 1;
        break;
      case "PageDown":
        nv = clamp01(v - 0.25);
        break;
      case "PageUp":
        nv = clamp01(v + 0.25);
        break;
      default:
        return;
    }
    e.preventDefault();
    onChange(ns, nv);
  };

  const sPct = Math.round(s * 100);
  const vPct = Math.round(v * 100);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        ref={ref}
        onMouseDown={start}
        onTouchStart={start}
        onKeyDown={onKeyDown}
        tabIndex={0}
        className="relative rounded-xs cursor-crosshair outline-none focus:ring-2 focus:ring-ring"
        style={{
          width: size,
          height: size,
          background: `linear-gradient(to top, #000, transparent),
                       linear-gradient(to right, #fff, hsl(${Math.round(
                         hue
                       )}, 100%, 50%))`,
        }}
        role="application"
        aria-roledescription="2D slider"
        aria-label="Saturation and Value"
        aria-describedby={ids.help}
      >
        <div
          className="absolute h-3 w-3 -mt-1.5 -ml-1.5 rounded-full border-2 border-white shadow"
          style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }}
          aria-hidden
        />
      </div>

      <p id={ids.help} className="sr-only">
        Use Left/Right to adjust saturation, Up/Down to adjust value. Hold Shift
        for larger steps. Home/End set saturation to min/max. PageUp/PageDown
        adjust value by larger steps.
      </p>

      <div id={ids.live} aria-live="polite" className="sr-only">
        Saturation {sPct} percent, Value {vPct} percent.
      </div>

      <div className="sr-only">
        <label>
          Saturation
          <input
            type="range"
            min={0}
            max={100}
            value={sPct}
            onChange={(e) => {
              const ns = clamp(Math.round(Number(e.target.value)) / 100, 0, 1);
              onChange(ns, v);
            }}
          />
        </label>
        <label>
          Value
          <input
            type="range"
            min={0}
            max={100}
            value={vPct}
            onChange={(e) => {
              const nv = clamp(Math.round(Number(e.target.value)) / 100, 0, 1);
              onChange(s, nv);
            }}
          />
        </label>
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
  alphaPct = 100,
  geom = "default",
  curve = "bezier",
}: {
  brushStyle: BrushStyle | "solid";
  strokeStyle: StrokeStyle | "solid";
  color: string;
  size: number;
  alphaPct?: number;
  geom?: "default" | "tall";
  curve?: "bezier" | "sine";
}): React.ReactNode {
  const a = Math.max(0, Math.min(1, alphaPct / 100));
  const dash = dashArrayFor(strokeStyle);

  const dims =
    geom === "tall"
      ? { w: 96, h: 96, x0: 6, x1: 90, y0: 88, rise: 78 }
      : { w: 96, h: 64, x0: 8, x1: 104, y0: 52, rise: 40 };

  const makeSineD = (ampScale = 1, cycles = geom === "tall" ? 1.3 : 1.1) => {
    const L = dims.x1 - dims.x0;
    const baseAmp = Math.min(
      dims.h * 0.22,
      Math.max(dims.h * 0.05, size * 0.5)
    );
    const amp = baseAmp * ampScale;

    const N = 20;
    let d = `M ${dims.x0} ${dims.y0}`;
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      const x = dims.x0 + L * t;
      const y =
        dims.y0 - dims.rise * t + amp * Math.sin(2 * Math.PI * cycles * t);
      d += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    return d;
  };

  const dBezier =
    geom === "tall"
      ? "M6 88 C 34 60, 62 36, 90 8"
      : "M8 52 C 32 28, 64 28, 104 12";

  const dStroke = curve === "sine" ? makeSineD(0.7) : dBezier;

  if (brushStyle === "spray") {
    const dots: React.ReactNode[] = [];
    const L = dims.x1 - dims.x0;
    const cycles = geom === "tall" ? 1.3 : 1.1;
    const amp = Math.min(dims.h * 0.22, Math.max(dims.h * 0.08, size * 0.5));

    for (let i = 0; i < 22; i++) {
      const t = i / 21;
      const on =
        strokeStyle === "solid"
          ? true
          : strokeStyle === "dashed"
            ? i % 6 < 4
            : i % 6 === 2;

      if (!on) continue;

      const x = dims.x0 + L * t;
      const y =
        curve === "sine"
          ? dims.y0 - dims.rise * t + amp * Math.sin(4 * Math.PI * cycles * t)
          : geom === "tall"
            ? 88 - 78 * t * (0.85 + 0.15 * Math.sin(t * 6.28))
            : 52 - 40 * t * (0.8 + 0.2 * Math.sin(t * 6.28));

      const r = Math.max(0.5, (size / 2) * 0.18);
      dots.push(
        <circle key={i} cx={x} cy={y} r={r} fill={color} opacity={0.7 * a} />
      );
    }
    return <>{dots}</>;
  }

  if (brushStyle === "pencil") {
    if (curve === "sine") {
      return (
        <path
          d={dStroke}
          fill="none"
          stroke={color}
          strokeWidth={Math.max(1, size * 0.6)}
          strokeLinecap="round"
          strokeDasharray={dash}
          strokeOpacity={0.9 * a}
        />
      );
    }

    return (
      <>
        <path
          d={dStroke}
          fill="none"
          stroke={color}
          strokeWidth={Math.max(1, size * 0.6)}
          strokeLinecap="round"
          strokeDasharray={dash}
          strokeOpacity={0.9 * a}
        />
        {Array.from({ length: 10 }).map((_, i) => (
          <line
            key={i}
            x1={geom === "tall" ? 8 + i * 8 : 10 + i * 10}
            y1={geom === "tall" ? 90 : 54}
            x2={geom === "tall" ? 12 + i * 8 : 14 + i * 10}
            y2={geom === "tall" ? 86 : 50}
            stroke={color}
            strokeWidth={0.8}
            strokeOpacity={0.2 * a}
          />
        ))}
      </>
    );
  }

  if (brushStyle === "calligraphy") {
    if (curve === "sine") {
      const dMain = makeSineD(1.1);
      const dUnder = makeSineD(0.6);
      return (
        <>
          <path
            d={dMain}
            fill="none"
            stroke={color}
            strokeWidth={size * 1.1}
            strokeLinecap="butt"
            strokeDasharray={dash}
            strokeOpacity={0.95 * a}
          />
          <path
            d={dUnder}
            fill="none"
            stroke={color}
            strokeWidth={size * 0.6}
            strokeLinecap="butt"
            strokeDasharray={dash}
            strokeOpacity={0.75 * a}
          />
        </>
      );
    }

    const d2 =
      geom === "tall"
        ? "M6 92 C 34 64, 62 40, 90 12"
        : "M8 56 C 32 32, 64 32, 104 16";
    return (
      <>
        <path
          d={dStroke}
          fill="none"
          stroke={color}
          strokeWidth={size * 1.1}
          strokeLinecap="butt"
          strokeDasharray={dash}
          strokeOpacity={0.95 * a}
        />
        <path
          d={d2}
          fill="none"
          stroke={color}
          strokeWidth={size * 0.6}
          strokeLinecap="butt"
          strokeDasharray={dash}
          strokeOpacity={0.75 * a}
        />
      </>
    );
  }

  if (brushStyle === "marker") {
    return (
      <path
        d={dStroke}
        fill="none"
        stroke={color}
        strokeWidth={size * 1.4}
        strokeLinecap="round"
        strokeDasharray={dash}
        strokeOpacity={0.9 * a}
      />
    );
  }

  return (
    <path
      d={dStroke}
      fill="none"
      stroke={color}
      strokeWidth={size}
      strokeLinecap="round"
      strokeDasharray={dash}
      strokeOpacity={a}
    />
  );
}

/* ---- card sizing constants (kept tight and consistent) ---- */
const CARD_W = 60; // px
const CARD_H = 39; // px
const GAP = 8; // px
const TWO_TALL = CARD_H * 2 + GAP; // 120px

function SizePreviewCard({
  size,
  color,
  strokeStyle,
  brushStyle,
  selected,
  onSelect,
  alphaPct = 100,
}: {
  size: number;
  color: string;
  strokeStyle: StrokeStyle | "solid";
  brushStyle: BrushStyle | "solid";
  selected: boolean;
  onSelect: () => void;
  alphaPct?: number;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "relative rounded-md bg-card transition cursor-pointer border",
        selected ? "ring-2 ring-ring" : "hover:bg-accent",
      ].join(" ")}
      style={{ width: CARD_W, height: CARD_H }}
      title={`${size}px`}
      aria-pressed={selected}
    >
      <svg viewBox="5 0 96 60" className="absolute inset-0 w-full h-full">
        <circle
          cx="12"
          cy="12"
          r={Math.max(1, size / 2)}
          fill={color}
          fillOpacity={alphaPct / 100}
        />
        {sizePreviewPath({
          brushStyle,
          strokeStyle,
          color,
          size,
          alphaPct,
        })}
      </svg>
      <span className="absolute bottom-1 right-1 text-[11px] text-muted-foreground">
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
  alphaPct = 100,
}: {
  size: number;
  color: string;
  strokeStyle: StrokeStyle | "solid";
  brushStyle: BrushStyle | "solid";
  onSize: (n: number) => void;
  alphaPct?: number;
}) {
  const s = clamp(size, 1, 50);

  const commit = (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    onSize(clamp(Math.round(n), 1, 50));
  };

  return (
    <div
      className="rounded-md bg-card p-1.5 flex flex-col border"
      style={{ width: CARD_W + 10, height: TWO_TALL }}
      title="Custom size"
    >
      <div className="relative flex-1 min-h-0">
        <svg viewBox="0 0 96 72" className="absolute inset-0 w-full h-full">
          <circle
            cx="12"
            cy="12"
            r={Math.max(1, s / 2)}
            fill={color}
            fillOpacity={alphaPct / 100}
          />
          {sizePreviewPath({
            brushStyle,
            strokeStyle,
            color,
            size: s,
            alphaPct,
            geom: "default",
            curve: "sine",
          })}
        </svg>
        <span className="absolute bottom-2 right-1 text-[11px] text-muted-foreground">
          {s}px
        </span>
      </div>

      {/* Stepper with text input */}
      <div className="flex items-center gap-1 w-full">
        <button
          type="button"
          className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-full bg-card hover:bg-accent cursor-pointer p-0 leading-none"
          onClick={() => onSize(clamp(s - 1, 1, 50))}
          aria-label="Decrease size"
        >
          −
        </button>

        <Input
          value={s}
          onChange={(e) => {
            const raw = e.target.value;
            // Let them type anything, commit on blur/enter
            if (/^\d*$/.test(raw)) {
              // keep numbers only
              commit(raw);
            }
          }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="h-5 w-12 px-1 text-center text-[11px] border-none"
        />

        <button
          type="button"
          className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-full bg-card hover:bg-accent cursor-pointer p-0 leading-none"
          onClick={() => onSize(clamp(s + 1, 1, 50))}
          aria-label="Increase size"
        >
          +
        </button>
      </div>
    </div>
  );
}

/* -------------------------- Style preview rows -------------------------- */

function StylePreviewRow({
  label,
  brushStyle,
  strokeStyle,
  color,
  size,
  alphaPct = 100,
}: {
  label: string;
  brushStyle: BrushStyle | "solid";
  strokeStyle: StrokeStyle | "solid";
  color: string;
  size: number;
  alphaPct?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs w-20">{label}</span>
      <svg viewBox="0 0 120 16" width="120" height="16">
        {sizePreviewPath({
          brushStyle,
          strokeStyle,
          color,
          size,
          alphaPct,
        })}
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

  // derive HSV from current color
  const rgb = useMemo(
    () => hexToRgb(stroke) ?? { r: 255, g: 255, b: 255 },
    [stroke]
  );
  const hsv0 = useMemo(() => rgbToHsv(rgb), [rgb]);
  const [h, setH] = useState<number>(hsv0.h);
  const [s, setS] = useState<number>(hsv0.s);
  const [v, setV] = useState<number>(hsv0.v);

  // --- HEX input state (single source of truth for the field) ---
  const [hexDraft, setHexDraft] = React.useState(stroke.replace(/^#/, ""));
  const hexRef = React.useRef<HTMLInputElement | null>(null);
  const suppressHexSync = React.useRef(false);

  // sync the field with external color changes unless we're typing
  useEffect(() => {
    if (document.activeElement === hexRef.current) return;
    if (suppressHexSync.current) {
      suppressHexSync.current = false;
      return;
    }
    setHexDraft(stroke.replace(/^#/, ""));
  }, [stroke]);

  // keep HSV in sync with stroke (for the pickers)
  useEffect(() => {
    const parsed = hexToRgb(stroke);
    if (parsed) {
      const { h, s, v } = rgbToHsv(parsed);
      setH(h);
      setS(s);
      setV(v);
    }
  }, [stroke]);

  // commit typed HEX when valid (3 or 6 hex chars), no autocomplete
  // commit typed HEX when valid (3 or 6 hex chars), no autocomplete
  function commitHex(rawArg?: string) {
    const raw = (rawArg ?? hexDraft).trim();
    if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) {
      // invalid -> leave color as-is
      setHexDraft(stroke.replace(/^#/, ""));
      return;
    }
    const six =
      raw.length === 3
        ? raw
            .split("")
            .map((c) => c + c)
            .join("")
        : raw;
    suppressHexSync.current = true; // keep user's typed form in the field
    onChangeAction({ stroke: `#${six.toLowerCase()}` });
  }

  const setHue = (nh: number) => {
    setH(nh);
    onChangeAction({ stroke: rgbToHex(hsvToRgb({ h: nh, s, v })) });
  };
  const setSV = (ns: number, nv: number) => {
    setS(ns);
    setV(nv);
    onChangeAction({ stroke: rgbToHex(hsvToRgb({ h, s: ns, v: nv })) });
  };

  return (
    <div
      className="flex flex-col gap-1 
                 sm:flex-row sm:gap-1.5 sm:items-stretch
                 sm:[&>section]:basis-1/3 sm:[&>section]:flex-1 sm:[&>section]:min-w-0
                "
    >
      {/* ===================== LEFT: Color ===================== */}
      <section className="space-y-1">
        <GroupLabel>Color</GroupLabel>

        <div className="flex items-start gap-1 md:max-w-none">
          {/* true 2×3 swatches */}
          <div className="grid grid-cols-1 grid-rows-3 gap-x-8 mr-4">
            {SWATCHES_2x3.map((c) => (
              <button
                key={c}
                type="button"
                className="h-4 w-4 mt-0.5 rounded-sm border cursor-pointer"
                style={{ backgroundColor: c }}
                title={c}
                aria-label={`Set ${c}`}
                onClick={() => onChangeAction({ stroke: c })}
              />
            ))}
          </div>

          {/* SV square + Hue (smaller height per your last layout) */}
          <div className="flex items-start gap-2">
            <SVSquare hue={h} s={s} v={v} onChange={setSV} size={110} />
            <VerticalHueSlider hue={h} onChange={setHue} height={110} />
          </div>

          {/* Alpha + HEX + RGB (stacked) */}
          <div className="flex flex-col ml-1 justify-between gap-0.5 mt-[-6px]">
            <div className="mt-[-5px]">
              <FieldLabel>Alpha / Opacity</FieldLabel>
              <NumericStepper
                value={alpha}
                onChange={(n) => onChangeAction({ alpha: clamp(n, 0, 100) })}
                min={0}
                max={100}
                step={1}
                ariaLabel="Alpha (opacity)"
              />
            </div>

            {/* HEX (no autocomplete; commits on Enter/blur) */}
            <div className="mt-[-10px]">
              <FieldLabel>
                <span className="text-[11px]">HEX</span>
              </FieldLabel>
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground select-none">
                  #
                </span>
                <Input
                  ref={hexRef}
                  value={hexDraft}
                  placeholder="rrggbb"
                  inputMode="text"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={6}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (/^[0-9a-fA-F]{0,6}$/.test(raw)) {
                      setHexDraft(raw);
                      // auto-commit as soon as it's a valid 3- or 6-digit hex
                      if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) {
                        commitHex(raw);
                      }
                    }
                  }}
                  onBlur={(e) => commitHex(e.target.value)}
                  onKeyDown={(e) => {
                    const v = (e.target as HTMLInputElement).value;
                    if (e.key === "Enter") {
                      commitHex(v);
                      (e.target as HTMLInputElement).blur();
                    } else if (e.key === "Escape") {
                      setHexDraft(stroke.replace(/^#/, ""));
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className="h-5 w-[75px] px-1 !text-[11px] rounded-sm"
                />
              </div>
            </div>

            <div className="mt-[-5px]">
              <FieldLabel>RGB (r,g,b[,a])</FieldLabel>
              <Input
                placeholder="255,0,128,1"
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const parsed = parseRgbString(
                    (e.target as HTMLInputElement).value.trim()
                  );
                  if (parsed) {
                    onChangeAction({ stroke: rgbToHex(parsed) });
                    if (parsed.a !== undefined)
                      onChangeAction({ alpha: Math.round(parsed.a * 100) });
                  }
                }}
                className="h-5 w-[90px] px-1 py-0 !text-[10.5px] leading-4 !placeholder:text-xs rounded-sm"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ===================== MIDDLE: Size ===================== */}
      <section className="flex justify-end">
        <div className="items-center space-y-2 min-h-[160px] md:max-w-none">
          <GroupLabel>Size</GroupLabel>
          <div className="flex gap-1 min-w-0">
            <CustomSizeCard
              size={strokeWidth}
              color={stroke}
              strokeStyle={strokeStyle}
              brushStyle={brushStyle}
              alphaPct={alpha}
              onSize={(n) => onChangeAction({ strokeWidth: n })}
            />
            <div className="grid grid-cols-2 gap-1.5 self-start min-w-0">
              {PRESET_SIZES.map((sVal, idx) => (
                <SizePreviewCard
                  key={`${sVal}-${idx}`}
                  size={sVal}
                  color={stroke}
                  strokeStyle={strokeStyle}
                  brushStyle={brushStyle}
                  alphaPct={alpha}
                  selected={sVal === strokeWidth}
                  onSelect={() => onChangeAction({ strokeWidth: sVal })}
                />
              ))}
            </div>
          </div>
          <label className="col-span-full flex items-center px-0.5 cursor-pointer select-none">
            <input
              style={{ marginRight: 5 }}
              type="checkbox"
              checked={options.pressure ?? true}
              onChange={(e) =>
                onChangeAction({ pressure: Boolean(e.target.checked) })
              }
              className="cursor-pointer"
            />
            <FieldLabel>Pressure sensitivity</FieldLabel>
            <Droplets className="ml-1 h-3.5 w-3.5 opacity-70" />
          </label>
        </div>
      </section>

      {/* ===================== RIGHT: Style + Advanced (compact) ===================== */}
      <section className="space-y-2 lg:col-span-1 min-h-[160px] md:max-w-none">
        {/* Style */}
        <div className="space-y-1">
          <GroupLabel>Style</GroupLabel>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-[-10px]">
            {/* Brush engine */}
            <div className="space-y-1">
              <FieldLabel>Brush engine</FieldLabel>
              <Select
                value={brushStyle}
                onValueChange={(v) =>
                  onChangeAction({ brushStyle: v as BrushStyle })
                }
              >
                <SelectTrigger className="w-full cursor-pointer h-7 px-2 text-xs leading-tight">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[3000] py-1">
                  {(
                    [
                      "solid",
                      "marker",
                      "calligraphy",
                      "spray",
                      "pencil",
                    ] as const
                  ).map((k) => (
                    <SelectItem key={k} value={k} className="py-1 text-xs">
                      <div className="-my-0.5 scale-90 origin-top-left">
                        <StylePreviewRow
                          label={k[0].toUpperCase() + k.slice(1)}
                          brushStyle={k}
                          strokeStyle={strokeStyle}
                          color={stroke}
                          size={strokeWidth}
                          alphaPct={alpha}
                        />
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Stroke pattern */}
            <div className="space-y-1">
              <FieldLabel>Stroke pattern</FieldLabel>
              <Select
                value={strokeStyle}
                onValueChange={(v) =>
                  onChangeAction({ strokeStyle: v as StrokeStyle })
                }
              >
                <SelectTrigger className="w-full cursor-pointer h-7 px-2 text-xs leading-tight">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[3000] py-1">
                  {(["solid", "dashed", "dotted"] as const).map((k) => (
                    <SelectItem key={k} value={k} className="py-1 text-xs">
                      <div className="-my-0.5 scale-90 origin-top-left">
                        <StylePreviewRow
                          label={k[0].toUpperCase() + k.slice(1)}
                          brushStyle={brushStyle}
                          strokeStyle={k}
                          color={stroke}
                          size={strokeWidth}
                          alphaPct={alpha}
                        />
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Advanced — perfectly aligned, no overflow */}
        <div className="space-y-1.5 mt-[-5px]">
          <div className="grid gap-1.5 sm:grid-cols-2">
            <div>
              <div className="flex justify-start w-full">
                <FieldLabel>Hardness</FieldLabel>
              </div>
              <div className="flex justify-between w-full items-center align-middle">
                <Range
                  value={options.hardness ?? 80}
                  onChange={(n) => onChangeAction({ hardness: n })}
                  min={0}
                  max={100}
                  className="min-w-0 h-6"
                />
                <span className="text-[11px] tabular-nums text-right">
                  {options.hardness ?? 80}%
                </span>
              </div>
            </div>

            <div>
              <div className="flex justify-start w-full ">
                <FieldLabel>Spacing</FieldLabel>
              </div>
              <div className="flex justify-between w-full items-center align-middle">
                <Range
                  value={options.spacing ?? 25}
                  onChange={(n) => onChangeAction({ spacing: n })}
                  min={1}
                  max={100}
                  className="min-w-0 h-6"
                />
                <span className="text-[11px] tabular-nums text-right">
                  {options.spacing ?? 25}%
                </span>
              </div>
            </div>

            <div>
              <div className="flex justify-start w-full mt-[-5px]">
                <FieldLabel>Flow</FieldLabel>
              </div>
              <div className="flex justify-between w-full items-center align-middle">
                <Range
                  value={options.flow ?? 100}
                  onChange={(n) => onChangeAction({ flow: n })}
                  min={1}
                  max={100}
                  className="min-w-0 h-6"
                />
                <span className="text-[11px] tabular-nums text-right">
                  {options.flow ?? 100}%
                </span>
              </div>
            </div>

            <div className="flex flex-col items-center min-w-0 mt-[-5px]">
              <div className="flex justify-start w-full">
                <FieldLabel>Smoothing</FieldLabel>
              </div>
              <div className="flex justify-between w-full items-center align-middle">
                <Range
                  value={options.smoothing ?? 20}
                  onChange={(n) => onChangeAction({ smoothing: n })}
                  min={0}
                  max={100}
                  className="min-w-0 h-6"
                />
                <span className="text-[11px] tabular-nums text-right">
                  {options.smoothing ?? 20}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
