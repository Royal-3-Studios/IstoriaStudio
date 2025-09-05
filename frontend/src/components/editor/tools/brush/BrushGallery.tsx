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
  const [catId, setCatId] = React.useState<string>(categories[0]?.id ?? "");
  React.useEffect(() => {
    if (!categories.some((c) => c.id === catId) && categories.length) {
      setCatId(categories[0].id);
    }
  }, [categories, catId]);

  return (
    <div className="w-full">
      {/* Mobile (sm): category select */}
      <div className="md:hidden mb-2">
        <Select value={catId} onValueChange={setCatId}>
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

      {/* Desktop/Tablet (md+): shadcn Tabs */}
      <div className="hidden md:block">
        <Tabs value={catId} onValueChange={setCatId} className="w-full">
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
                categoryId={c.id}
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
          categoryId={catId}
          activeBrushId={activeBrushId}
          onSelectAction={onSelectAction}
        />
      </div>
    </div>
  );
}

function CategoryGrid({
  categoryId,
  activeBrushId,
  onSelectAction,
}: {
  categoryId: string;
  activeBrushId: string;
  onSelectAction: (id: string) => void;
}) {
  const category = React.useMemo(
    () => BRUSH_CATEGORIES.find((c) => c.id === categoryId),
    [categoryId]
  );
  if (!category) return null;

  return (
    <div
      className="grid gap-6"
      // Wider cards with auto-fit; each card >= 240px
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
