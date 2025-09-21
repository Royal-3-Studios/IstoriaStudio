// src/components/editor/tools/BrushGallery.tsx
"use client";

import * as React from "react";
import { BRUSH_CATEGORIES, type BrushCategory } from "@/data/brushPresets";
import { BrushCard } from "./BrushCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function BrushGallery({
  activeBrushId,
  onSelectAction,
  categories = BRUSH_CATEGORIES,
}: {
  activeBrushId: string;
  onSelectAction: (id: string) => void;
  categories?: BrushCategory[];
}) {
  // Lazy init so SSR/CSR match
  const [catId, setCatId] = React.useState<string>(
    () => categories[0]?.id ?? ""
  );

  // Keep selected category valid if the list changes
  React.useEffect(() => {
    if (!categories.length) {
      setCatId("");
      return;
    }
    if (!categories.some((c) => c.id === catId)) {
      setCatId(categories[0].id);
    }
  }, [categories, catId]);

  if (!categories.length) {
    return (
      <div className="text-sm text-muted-foreground">
        No brush categories available.
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Mobile (sm): category select */}
      <div className="md:hidden mb-2">
        <Select value={catId} onValueChange={(v) => setCatId(v)}>
          <SelectTrigger className="h-8 w-full">
            <SelectValue placeholder="Brush category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-sm">
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop/Tablet (md+): Tabs */}
      <div className="hidden md:block">
        <Tabs
          value={catId}
          onValueChange={(v) => setCatId(v)}
          className="w-full"
        >
          <TabsList className="flex flex-wrap justify-start gap-1">
            {categories.map((c) => (
              <TabsTrigger key={c.id} value={c.id} className="text-xs">
                {c.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {categories.map((c) => (
            <TabsContent key={c.id} value={c.id} className="mt-2">
              <CategoryGrid
                category={c}
                activeBrushId={activeBrushId}
                onSelectAction={onSelectAction}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Mobile (sm): grid under the select */}
      <div className="md:hidden">
        <CategoryGrid
          category={categories.find((c) => c.id === catId) ?? categories[0]}
          activeBrushId={activeBrushId}
          onSelectAction={onSelectAction}
        />
      </div>
    </div>
  );
}

function CategoryGrid({
  category,
  activeBrushId,
  onSelectAction,
}: {
  category: BrushCategory;
  activeBrushId: string;
  onSelectAction: (id: string) => void;
}) {
  if (!category?.brushes?.length) {
    return (
      <div className="text-sm text-muted-foreground">
        No brushes in this category.
      </div>
    );
  }

  return (
    <div
      className="grid gap-6"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}
    >
      {category.brushes.map((b) => (
        <BrushCard
          key={b.id}
          preset={b}
          selected={b.id === activeBrushId}
          onSelect={onSelectAction}
        />
      ))}
    </div>
  );
}
