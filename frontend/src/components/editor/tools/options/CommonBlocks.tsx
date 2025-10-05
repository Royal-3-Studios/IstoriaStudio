// =============================================================
// src/components/editor/tools/options/CommonBlocks.tsx
// Small building blocks used by options UIs
// =============================================================
"use client";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export function Block({
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

export function NumberField({
  label,
  value,
  onChangeAction,
  min = 0,
  max = 1000,
  step = 1,
  className = "",
}: {
  label?: string;
  value: number;
  onChangeAction: (n: number) => void;
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
        onChange={(e) => onChangeAction(Number(e.target.value || 0))}
        min={min}
        max={max}
        step={step}
        className={["h-8 w-16", className].join(" ")}
      />
    </div>
  );
}

export function RangeField({
  value,
  onChangeAction,
  min = 0,
  max = 100,
  step = 1,
  className = "",
}: {
  value: number;
  onChangeAction: (n: number) => void;
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
      onChange={(e) => onChangeAction(Number(e.target.value))}
      className={[
        "h-8 w-28 cursor-pointer appearance-none bg-transparent",
        "[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-muted",
        "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary",
        className,
      ].join(" ")}
    />
  );
}

export function ColorField({
  value,
  onChangeAction,
}: {
  value: string;
  onChangeAction: (v: string) => void;
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
        onChange={(e) => onChangeAction(e.target.value)}
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
            onClick={() => onChangeAction(c)}
          />
        ))}
      </div>
    </div>
  );
}

export function SelectField({
  value,
  onChangeAction,
  options,
  label,
  className = "",
}: {
  value: string;
  onChangeAction: (v: string) => void;
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
          className,
        ].join(" ")}
        value={value}
        onChange={(e) => onChangeAction(e.target.value)}
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

export { Separator };
