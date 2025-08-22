// src/app/projects/[projectId]/hooks/useProject.tsx

"use client";
import { useEffect, useState } from "react";

export type Project = {
  id: string;
  title: string;
  type: string;
  description?: string | null;
};

export function useProject(projectId: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setErr] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/project/${projectId}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(await res.text());
        const data: Project = await res.json();
        if (!cancelled) setProject(data);
      } catch (e: unknown) {
        console.error((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return { project, loading, error };
}
