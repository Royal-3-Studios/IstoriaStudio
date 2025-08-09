// src/app/(app)/projects/new/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function NewProjectPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");

  async function create() {
    const res = await fetch("/api/project", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        type: "cover",
        description: desc,
        is_active: true,
      }),
    });
    if (!res.ok) {
      console.error(await res.text());
      return;
    }
    const data = await res.json();
    router.push(`/projects/${data.id ?? ""}`);
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">New Project</h1>
      <div className="max-w-xl space-y-3">
        <Input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          placeholder="Brief / prompt"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <div className="flex gap-2">
          <Button disabled={!title} onClick={create}>
            Create
          </Button>
          <Button variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
