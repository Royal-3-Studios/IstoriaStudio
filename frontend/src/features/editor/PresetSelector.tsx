// src/components/editor/PresetSelector.tsx
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ChevronsUpDown } from "lucide-react";
import { PRESETS } from "@/data/presets";

// If your presets file already exports a Preset type, import it instead.
type Category = "book" | "music" | "social" | "ads" | "other";
interface Preset {
  id: string;
  label: string;
  width: number;
  height: number;
  category: string; // normalized to Category at runtime
  tags?: string[];
  popularity?: number;
}

const presets: Preset[] = PRESETS as unknown as Preset[];
const CATEGORY_ORDER: Category[] = ["book", "music", "social", "ads", "other"];
const BASE_CATS = new Set<Category>([
  "book",
  "music",
  "social",
  "ads",
  "other",
]);

type Props = {
  value: string;
  onValueChangeAction: (id: string) => void; // <-- satisfies Next rule
};

export default function PresetSelector({ value, onValueChangeAction }: Props) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState<string>("");

  const selected = React.useMemo(
    () => presets.find((p) => p.id === value) ?? null,
    [value]
  );

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return presets
      .filter((p) => {
        if (!needle) return true;
        if (p.label.toLowerCase().includes(needle)) return true;
        return (p.tags ?? []).some((t) => t.toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        const pop = (b.popularity ?? 0) - (a.popularity ?? 0);
        return pop !== 0 ? pop : a.label.localeCompare(b.label);
      });
  }, [q]);

  const groups = React.useMemo((): Array<{
    cat: Category;
    items: Preset[];
  }> => {
    const map: Record<Category, Preset[]> = {
      book: [],
      music: [],
      social: [],
      ads: [],
      other: [],
    };
    for (const p of filtered) {
      const cat = (
        BASE_CATS.has(p.category as Category)
          ? (p.category as Category)
          : "other"
      ) as Category;
      map[cat].push(p);
    }
    return CATEGORY_ORDER.map((cat) => ({ cat, items: map[cat] })).filter(
      (g) => g.items.length > 0
    );
  }, [filtered]);

  return (
    <div className="space-y-2 w-full min-w-72 cursor-pointer">
      <label className="text-sm font-medium ml-2">Sizes:</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between rounded-full text-xs sm:text-sm cursor-pointer sm:h-8"
          >
            <p className="text-center w-full">
              {selected ? `${selected.label}` : "Search & choose a preset"}
            </p>
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-full p-0 max-h-[60vh] text-xs cursor-pointer">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Type to search presets…"
              value={q}
              onValueChange={setQ}
            />
            <CommandList>
              <CommandEmpty>No results.</CommandEmpty>

              {groups.map(({ cat, items }) => (
                <CommandGroup
                  key={cat}
                  heading={cat.charAt(0).toUpperCase() + cat.slice(1)}
                >
                  {items.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={p.id}
                      onSelect={() => {
                        onValueChangeAction(p.id);
                        setOpen(false);
                        setQ("");
                      }}
                    >
                      <div className="flex flex-col cursor-pointer w-full">
                        <span className="text-xs sm:text-sm">{p.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {p.width}×{p.height} • {p.category}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
