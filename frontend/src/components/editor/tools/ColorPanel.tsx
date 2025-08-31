// src/components/editor/tools/ColorPanel.tsx
"use client";
import * as React from "react";
import { Input } from "@/components/ui/input";

// TIP: move your SVSquare, VerticalHueSlider, and hex/RGB helpers into this file,
// or import them from where you defined them.

type Props = {
  value: string; // hex like "#ff00aa"
  alpha: number; // 0..100
  onChangeAction: (hex: string, alpha: number) => void;
};

export default function ColorPanel({ value, alpha, onChangeAction }: Props) {
  // Implement with your existing logic (SVSquare + Hue, HEX input, RGB input)
  // For brevity, here’s a minimal stub with HEX + Alpha only:
  const [hex, setHex] = React.useState(value.replace(/^#/, ""));
  React.useEffect(() => setHex(value.replace(/^#/, "")), [value]);

  const commit = (raw?: string) => {
    const r = (raw ?? hex).trim();
    if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(r)) {
      setHex(value.replace(/^#/, ""));
      return;
    }
    const six =
      r.length === 3
        ? r
            .split("")
            .map((c) => c + c)
            .join("")
        : r;
    onChangeAction(`#${six.toLowerCase()}`, alpha);
  };

  return (
    <section className="space-y-2">
      <h4 className="text-[11px] font-medium tracking-wide text-muted-foreground">
        Color
      </h4>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground select-none">#</span>
        <Input
          value={hex}
          maxLength={6}
          onChange={(e) => {
            const raw = e.target.value;
            if (/^[0-9a-fA-F]{0,6}$/.test(raw)) {
              setHex(raw);
              if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) commit(raw);
            }
          }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" &&
            (commit(), (e.target as HTMLInputElement).blur())
          }
          className="h-6 w-[100px] px-1 !text-[11px]"
          placeholder="rrggbb"
        />

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Opacity</span>
          <Input
            value={alpha}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n))
                onChangeAction(
                  value,
                  Math.max(0, Math.min(100, Math.round(n)))
                );
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="h-6 w-12 px-1 text-center !text-[11px]"
          />
        </div>
      </div>

      {/* OPTIONAL: reinsert your SVSquare + VerticalHueSlider here */}
    </section>
  );
}
