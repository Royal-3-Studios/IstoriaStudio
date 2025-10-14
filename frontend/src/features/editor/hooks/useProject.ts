// src/features/editor/hooks/useProject.ts
"use client";

import { useEffect, useMemo, useState } from "react";

type UUID = string;

export type GeneratedAssetLite = {
  id: UUID;
  created_at?: string;
  url?: string;
  thumb_url?: string;
  asset_type?: { id?: UUID; key?: string; label?: string } | null;
};

export type ProjectRead = {
  id: UUID;
  title: string;
  type: string;
  status: string;
  description?: string | null;
  email?: string | null;
  user_id?: UUID | null;
  is_active: boolean;
  created_at: string;
  featured_asset_id?: UUID | null;
  featured_asset?: GeneratedAssetLite | null;
  assets: GeneratedAssetLite[];
  tags: string[];
};

type FetchResult<T> = {
  ok: boolean;
  status: number;
  data: T | Record<string, unknown>;
};

// ✅ Always go through the Next proxy so cookies work and URLs are stable
const PROJECT_API = `/api/project`;

async function fetchJSON<T>(
  url: string,
  init?: RequestInit
): Promise<FetchResult<T>> {
  const resp = await fetch(url, {
    ...init,
    credentials: "include",
    headers: { accept: "application/json", ...(init?.headers || {}) },
  });
  const ct = resp.headers.get("content-type") || "";
  let data: T | Record<string, unknown> = {} as T;
  if (ct.includes("application/json")) {
    try {
      data = (await resp.json()) as T;
    } catch {}
  } else {
    // read and discard to free the stream
    try {
      await resp.text();
    } catch {}
  }
  return { ok: resp.ok, status: resp.status, data };
}

export function useProject(projectId: string) {
  const [project, setProject] = useState<ProjectRead | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const stableId = useMemo(() => projectId, [projectId]);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Option A (fast): get the list and find the id client-side
        const res = await fetchJSON<ProjectRead[]>(`${PROJECT_API}`, {
          method: "GET",
          signal: ctrl.signal,
        });

        if (!res.ok) {
          if (!cancelled) {
            setError(`Failed to load projects (status ${res.status})`);
            setProject(null);
          }
          return;
        }

        const list = Array.isArray(res.data) ? (res.data as ProjectRead[]) : [];
        const found = list.find((p) => p.id === stableId);

        if (!cancelled) {
          if (!found) {
            setError("Project not found for this user.");
            setProject(null);
          } else {
            setProject(found);
          }
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Failed to load project");
          setProject(null);
        }
      } finally {
        if (!cancelled) setLoading(false); // ✅ always clear loading
      }
    };

    void load();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [stableId]);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchJSON<ProjectRead[]>(`${PROJECT_API}`, {
        method: "GET",
      });
      if (!res.ok) {
        setError(`Failed to load projects (status ${res.status})`);
        setProject(null);
      } else {
        const list = Array.isArray(res.data) ? (res.data as ProjectRead[]) : [];
        const found = list.find((p) => p.id === stableId);
        setProject(found ?? null);
        if (!found) setError("Project not found for this user.");
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load project");
      setProject(null);
    } finally {
      setLoading(false);
    }
  };

  return { project, loading, error, reload };
}
