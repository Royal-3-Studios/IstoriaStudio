"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { notFound } from "next/navigation";

type GeneratedAsset = {
  id: string;
  url: string;
  name: string | null;
  resolution: string;
  text_overlays: { text: string; x: number; y: number }[];
};

export default function EditorPage() {
  const { projectId } = useParams();
  const [assets, setAssets] = useState<GeneratedAsset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<GeneratedAsset | null>(
    null
  );

  // Load assets for this project
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/assets?projectId=${projectId}`)
      .then((res) => res.json())
      .then(setAssets);
  }, [projectId]);

  // Select the first asset by default
  useEffect(() => {
    if (assets.length > 0) {
      setSelectedAsset(assets[0]);
    }
  }, [assets]);

  const handleTextChange = (index: number, newText: string) => {
    if (!selectedAsset) return;
    const newOverlays = [...selectedAsset.text_overlays];
    newOverlays[index].text = newText;
    setSelectedAsset({ ...selectedAsset, text_overlays: newOverlays });
  };

  const handleSave = async () => {
    if (!selectedAsset) return;
    await fetch(`/api/assets/${selectedAsset.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text_overlays: selectedAsset.text_overlays,
        name: selectedAsset.name,
      }),
    });
    alert("Changes saved!");
  };

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-bold">Editor: Project {projectId}</h1>

      {/* Asset Picker */}
      <div className="flex gap-4 overflow-x-auto">
        {assets.map((a) => (
          <div
            key={a.id}
            onClick={() => setSelectedAsset(a)}
            className={`border rounded p-1 cursor-pointer ${
              selectedAsset?.id === a.id ? "border-blue-500" : "border-gray-300"
            }`}
          >
            <Image
              src={a.url}
              alt={a.name || "Asset"}
              width={100}
              height={100}
            />
          </div>
        ))}
      </div>

      {/* Editor */}
      {selectedAsset && (
        <div>
          <h2 className="text-lg font-semibold">
            Editing Asset: {selectedAsset.name}
          </h2>
          <div className="relative w-[512px] h-[512px] border shadow overflow-hidden">
            <Image
              src={selectedAsset.url}
              alt="Asset"
              fill
              className="object-contain"
            />
            {selectedAsset.text_overlays.map((overlay, index) => (
              <Input
                key={index}
                value={overlay.text}
                onChange={(e) => handleTextChange(index, e.target.value)}
                className="absolute bg-white/80 border px-2 py-1 text-sm"
                style={{
                  top: overlay.y,
                  left: overlay.x,
                  position: "absolute",
                }}
              />
            ))}
          </div>

          <Button className="mt-4" onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      )}
    </div>
  );
}
