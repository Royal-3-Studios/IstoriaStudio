// src/app/projects/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Project } from "@/types/project";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const router = useRouter();

  // Fetch all user's projects
  useEffect(() => {
    async function fetchProjects() {
      const res = await fetch("/api/project", { credentials: "include" });
      const data = await res.json();
      setProjects(data);
    }
    fetchProjects();
  }, []);

  const handleCreate = async () => {
    const res = await fetch("http://localhost:8000/api/project/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        title,
        type: "cover",
        status: "pending",
        description: prompt,
        is_active: true,
      }),
    });

    if (res.ok) {
      const newProject = await res.json();
      router.push(`/project/${newProject.id}/editor`);
    } else {
      const text = await res.text();
      console.error("Error response from server:", text);
    }
  };

  return (
    <div className="p-6 space-y-8">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Create New Project</h1>
        <Input
          placeholder="Project Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Textarea
          placeholder="Prompt (e.g. A fantasy book cover with a glowing sword)"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <Button onClick={handleCreate}>Generate Cover</Button>
      </div>

      <div className="pt-10">
        <h2 className="text-xl font-semibold">Your Projects</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {projects.map((project) => (
            <div
              key={project.id}
              className="border rounded-lg p-4 cursor-pointer hover:shadow"
              onClick={() => router.push(`/project/${project.id}/editor`)}
            >
              <div className="font-semibold">{project.title}</div>
              <div className="text-sm text-muted-foreground">
                {project.status}
              </div>
              {project.assets?.[0]?.thumbnail_url && (
                <Image
                  src={project.assets[0].thumbnail_url}
                  alt="Preview"
                  className="mt-2 w-full rounded"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
