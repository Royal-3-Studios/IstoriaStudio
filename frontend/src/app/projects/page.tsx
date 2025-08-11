"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/store/auth";
import type { Project } from "@/types/project";
import { ProjectCard } from "@/components/ProjectCard";
import { NewProjectInlineCard } from "@/components/NewProjectInlineCard";

export default function ProjectsPage() {
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [notAuthed, setNotAuthed] = useState(false);
  const [showNewInline, setShowNewInline] = useState(false);

  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    void loadProjects();
  }, []);

  async function loadProjects() {
    try {
      setLoading(true);
      const res = await fetch("/api/project", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401) {
        setNotAuthed(true);
        setProjectList([]);
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      setProjectList(await res.json());
      setNotAuthed(false);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load projects");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(values: {
    title: string;
    description?: string | null;
    type: string;
  }) {
    const res = await fetch("/api/project", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: values.title,
        description: values.description ?? null,
        type: values.type,
        is_active: true,
      }),
    });

    if (!res.ok) {
      console.error(await res.text());
      return;
    }

    await loadProjects();
    setShowNewInline(false);
  }

  // Handle child events (delete/cover)
  function handleCardChanged(e: { type: "deleted" | "cover"; id: string }) {
    if (e.type === "deleted") {
      // Optimistically remove without reloading
      setProjectList((prev) => prev.filter((p) => p.id !== e.id));
    } else if (e.type === "cover") {
      // Easiest: do a small refresh for correctness (or update fields locally if you prefer)
      void loadProjects();
    }
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between max-w-5xl mx-auto w-full">
        <h1 className="text-2xl font-bold">Projects</h1>
        {user && (
          <Button onClick={() => setShowNewInline(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        )}
      </header>

      {notAuthed ? (
        <div className="w-full max-w-5xl mx-auto">
          <Card className="w-full p-6 text-center">
            <p className="text-sm text-muted-foreground">
              You’re not logged in. Join or sign in to create and view projects.
            </p>
            <div className="mt-3 flex justify-center gap-2">
              <Button asChild>
                <a href="/api/auth/login">Login</a>
              </Button>
              <Button variant="secondary" asChild>
                <a href="/api/auth/login">Join</a>
              </Button>
            </div>
          </Card>
        </div>
      ) : loading ? (
        <div className="space-y-4 w-full max-w-5xl mx-auto">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded" />
          ))}
        </div>
      ) : projectList.length === 0 ? (
        <div className="space-y-4 w-full max-w-5xl mx-auto">
          {showNewInline ? (
            <NewProjectInlineCard
              onSave={handleCreate}
              onCancel={() => setShowNewInline(false)}
            />
          ) : (
            <Card className="w-full p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No projects yet. Click <b>New Project</b> to get started.
              </p>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-4 w-full max-w-5xl mx-auto">
          {showNewInline && (
            <NewProjectInlineCard
              onSave={handleCreate}
              onCancel={() => setShowNewInline(false)}
            />
          )}
          {projectList.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onChanged={handleCardChanged}
            />
          ))}
        </div>
      )}
      <Toaster />
    </div>
  );
}
