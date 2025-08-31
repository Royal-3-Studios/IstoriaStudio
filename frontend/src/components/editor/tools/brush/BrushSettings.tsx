"use client";
import * as React from "react";
import type { BrushPreset, BrushParam } from "@/data/brushPresets";
import { Input } from "@/components/ui/input";

// Small range (reuse yours if you like)
function Range({
  value,
  onChangeAction,
  min = 0,
  max = 100,
  step = 1,
  ariaLabel,
}: {
  value: number;
  onChangeAction: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChangeAction(Number(e.target.value))}
      aria-label={ariaLabel}
      className="h-6 w-full cursor-pointer"
    />
  );
}

function ParamControl({
  param,
  value,
  onChangeAction,
}: {
  param: BrushParam;
  value: number;
  onChangeAction: (n: number) => void;
}) {
  const common = {
    min: param.min ?? 0,
    max: param.max ?? 100,
    step: param.step ?? 1,
  };

  // Simple mapping (expand as needed)
  switch (param.type) {
    case "size":
    case "hardness":
    case "flow":
    case "spacing":
    case "smoothing":
    case "angle":
    case "jitterSize":
    case "jitterAngle":
    case "grain":
    case "opacity":
      return (
        <div className="flex items-center gap-2">
          <div className="w-28 text-xs">{param.label}</div>
          <Range
            value={value}
            onChangeAction={onChangeAction}
            {...common}
            ariaLabel={param.label}
          />
          <Input
            value={value}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n))
                onChangeAction(
                  Math.max(common.min, Math.min(common.max, Math.round(n)))
                );
            }}
            className="h-6 w-14 px-1 text-center text-[11px]"
          />
        </div>
      );
    default:
      return null;
  }
}

export function BrushSettings({
  preset,
  values,
  onChangeAction,
  onResetAction,
}: {
  preset: BrushPreset;
  values: Record<string, number>;
  onChangeAction: (key: string, value: number) => void;
  onResetAction: () => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-medium tracking-wide text-muted-foreground">
          Settings — {preset.name}
        </h4>
        <button
          type="button"
          className="text-[11px] underline underline-offset-2 hover:opacity-80"
          onClick={onResetAction}
        >
          Reset
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {preset.params.map((p) => {
          if (p.show === false) return null;
          const val = values[p.key] ?? p.defaultValue;
          return (
            <ParamControl
              key={p.key}
              param={p}
              value={val}
              onChangeAction={(n) => onChangeAction(p.key, n)}
            />
          );
        })}
      </div>
    </section>
  );
}
