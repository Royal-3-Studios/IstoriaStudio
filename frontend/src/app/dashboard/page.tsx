// src/app/dashboard/page.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import type { Project } from "@/types/project";
import { ProjectCard } from "@/components/cards/ProjectCard";
import { createProject, listProjects } from "@/lib/api/projects";

export default function DashboardPage() {
  const [projects, setProjects] = React.useState<Project[]>([]);
  const router = useRouter();

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await listProjects();
        if (mounted) setProjects(data);
      } catch (err) {
        console.error(err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleNewProject = async (): Promise<void> => {
    try {
      const p = await createProject({ type: "cover" as Project["type"] });
      router.push(`/projects/${p.id}/editor`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Your Projects</h1>
        <button
          type="button"
          onClick={handleNewProject}
          className="bg-accent text-primary px-4 py-2 rounded-md"
        >
          + New Project
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {projects.map((project: Project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
}
