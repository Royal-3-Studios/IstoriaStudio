// src/app/projects/[projectId]/hooks/useGeneration.tsx

"use client";
import { useState } from "react";
import { toast } from "sonner";
import { BACKEND } from "@/lib/api";

export function useGeneration(projectId: string) {
  const [isGenerating, setGenerating] = useState(false);
  const [isImageLoading, setImageLoading] = useState(false);
  const [generatedUrls, setGeneratedUrls] = useState<string[]>([]);

  async function generate(params: {
    prompt: string;
    presetId: string;
    width: number;
    height: number;
    onImage: (url: string, img: HTMLImageElement) => void;
  }) {
    const { prompt, presetId, width, height, onImage } = params;
    try {
      if (!prompt.trim()) return;
      setGenerating(true);
      setImageLoading(true);

      const res = await fetch(`${BACKEND}/api/generated-asset/generate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          prompt,
          preset: presetId,
          width,
          height,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const url = (data.url ?? data.asset?.url) as string;
      if (!url) throw new Error("No image URL returned.");

      setGeneratedUrls((prev) => [url, ...prev]);

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        onImage(url, img);
        setImageLoading(false);
      };
      img.src = url;

      toast.success("Generated!");
    } catch (e) {
      console.error(e);
      toast.error("Generation failed");
      setImageLoading(false);
    } finally {
      setGenerating(false);
    }
  }

  return { isGenerating, isImageLoading, generatedUrls, generate };
}
