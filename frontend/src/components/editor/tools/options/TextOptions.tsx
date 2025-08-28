// =============================================================
// src/components/editor/tools/options/TextOptions.tsx
// =============================================================
"use client";
import type { ToolOptions, TextAlignX } from "../../types";
import { Block, NumberField, SelectField } from "./CommonBlocks";
import { Input } from "@/components/ui/input";
import { TextPreview } from "../previews/TextPreview";

export function TextOptions({
  options,
  onChangeAction,
}: {
  options: Partial<ToolOptions>;
  onChangeAction: (patch: Partial<ToolOptions>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Block title="Font">
        <Input
          placeholder="Font family"
          value={options.fontFamily ?? "Inter"}
          onChange={(e) => onChangeAction({ fontFamily: e.target.value })}
          className="h-8 w-40"
        />
        <NumberField
          label="Size"
          value={options.fontSize ?? 48}
          min={4}
          max={512}
          onChangeAction={(n) => onChangeAction({ fontSize: n })}
        />
        <NumberField
          label="Weight"
          value={options.fontWeight ?? 600}
          min={100}
          max={900}
          step={100}
          onChangeAction={(n) => onChangeAction({ fontWeight: n })}
        />
      </Block>
      <Block title="Align">
        <SelectField
          value={options.textAlign ?? "left"}
          onChangeAction={(v) => onChangeAction({ textAlign: v as TextAlignX })}
          options={[
            { label: "Left", value: "left" },
            { label: "Center", value: "center" },
            { label: "Right", value: "right" },
            { label: "Justify", value: "justify" },
          ]}
        />
      </Block>
      <TextPreview
        color={options.fill ?? "#ffffff"}
        fontFamily={options.fontFamily ?? "Inter"}
        fontSize={options.fontSize ?? 24}
        fontWeight={options.fontWeight ?? 600}
      />
    </div>
  );
}
