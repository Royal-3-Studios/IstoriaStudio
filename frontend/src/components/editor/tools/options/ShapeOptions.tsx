// =============================================================
// src/components/editor/tools/options/ShapeOptions.tsx
// =============================================================
"use client";
import type { ToolOptions, LineCap, LineJoin } from "../../types";
import {
  Block,
  ColorField,
  NumberField,
  SelectField,
  Separator,
} from "./CommonBlocks";
import type { BooleanOp, PathAlign } from "../../types";

export function ShapeOptions({
  options,
  onChangeAction,
  onBooleanOp,
  onPathAlign,
}: {
  options: Partial<ToolOptions>;
  onChangeAction: (patch: Partial<ToolOptions>) => void;
  onBooleanOp?: (op: BooleanOp) => void;
  onPathAlign?: (align: PathAlign) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Block title="Stroke">
        <ColorField
          value={options.stroke ?? "#ffffff"}
          onChangeAction={(v) => onChangeAction({ stroke: v })}
        />
        <NumberField
          label="W"
          value={options.strokeWidth ?? 2}
          min={0}
          max={200}
          onChangeAction={(n) => onChangeAction({ strokeWidth: n })}
        />
      </Block>
      <Block title="Fill">
        <ColorField
          value={options.fill ?? "#000000"}
          onChangeAction={(v) => onChangeAction({ fill: v })}
        />
      </Block>
      <Block title="Caps">
        <SelectField
          value={options.lineCap ?? "round"}
          onChangeAction={(v) => onChangeAction({ lineCap: v as LineCap })}
          options={[
            { label: "Butt", value: "butt" },
            { label: "Round", value: "round" },
            { label: "Square", value: "square" },
          ]}
        />
      </Block>
      <Block title="Joins">
        <SelectField
          value={options.lineJoin ?? "round"}
          onChangeAction={(v) => onChangeAction({ lineJoin: v as LineJoin })}
          options={[
            { label: "Miter", value: "miter" },
            { label: "Round", value: "round" },
            { label: "Bevel", value: "bevel" },
          ]}
        />
      </Block>
      {onBooleanOp && (
        <Block title="Boolean">
          <button
            className="px-2 py-1 text-sm rounded border cursor-pointer"
            onClick={() => onBooleanOp("union")}
          >
            Union
          </button>
          <button
            className="px-2 py-1 text-sm rounded border cursor-pointer"
            onClick={() => onBooleanOp("subtract")}
          >
            Subtract
          </button>
          <button
            className="px-2 py-1 text-sm rounded border cursor-pointer"
            onClick={() => onBooleanOp("intersect")}
          >
            Intersect
          </button>
          <button
            className="px-2 py-1 text-sm rounded border cursor-pointer"
            onClick={() => onBooleanOp("exclude")}
          >
            Exclude
          </button>
        </Block>
      )}
      {onPathAlign && (
        <Block title="Align">
          <button
            className="px-2 py-1 text-sm rounded border cursor-pointer"
            onClick={() => onPathAlign("left")}
          >
            Left
          </button>
          <button
            className="px-2 py-1 text-sm rounded border cursor-pointer"
            onClick={() => onPathAlign("center")}
          >
            Center
          </button>
          <button
            className="px-2 py-1 text-sm rounded border cursor-pointer"
            onClick={() => onPathAlign("right")}
          >
            Right
          </button>
          <Separator orientation="vertical" className="mx-1 h-6" />
          <button
            className="px-2 py-1 text-sm rounded border cursor-pointer"
            onClick={() => onPathAlign("top")}
          >
            Top
          </button>
          <button
            className="px-2 py-1 text-sm rounded border cursor-pointer"
            onClick={() => onPathAlign("middle")}
          >
            Middle
          </button>
          <button
            className="px-2 py-1 text-sm rounded border cursor-pointer"
            onClick={() => onPathAlign("bottom")}
          >
            Bottom
          </button>
        </Block>
      )}
    </div>
  );
}
