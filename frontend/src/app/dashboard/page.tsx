"use client";

import { ProjectCard } from "./components/ProjectCard";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Project } from "@/types/project";

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const router = useRouter();

  useEffect(() => {
    const fetchProjects = async () => {
      const res = await fetch("/api/projects", { credentials: "include" });
      const data = await res.json();
      setProjects(data);
    };
    fetchProjects();
  }, []);

  const handleNewProject = async () => {
    const res = await fetch("/api/projects", {
      method: "POST",
      credentials: "include",
      body: JSON.stringify({ type: "cover" }),
      headers: { "Content-Type": "application/json" },
    });

    const data = await res.json();
    router.push(`/projects/${data.id}/editor`);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Your Projects</h1>
        <button
          onClick={handleNewProject}
          className="bg-accent text-primary px-4 py-2 rounded-md"
        >
          + New Project
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
}
