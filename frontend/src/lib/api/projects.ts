// src/lib/api/projects.ts
import type { Project } from "@/types/project";

export type DeleteCascade = "project_only" | "project_and_assets";

async function safeText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t || `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

/** GET /api/project */
export async function listProjects(): Promise<Project[]> {
  const res = await fetch("/api/project", {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await safeText(res));
  return res.json() as Promise<Project[]>;
}

/** GET /api/project/:id */
export async function getProject(projectId: string): Promise<Project> {
  const res = await fetch(`/api/project/${encodeURIComponent(projectId)}`, {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await safeText(res));
  return res.json() as Promise<Project>;
}

/** POST /api/project */
export async function createProject(input: {
  type: Project["type"];
  title?: string;
  description?: string;
}): Promise<Project> {
  const res = await fetch("/api/project", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await safeText(res));
  return res.json() as Promise<Project>;
}

/** DELETE /api/project/:id?cascade=project_only|project_and_assets */
export async function deleteProject(
  projectId: string,
  cascade: DeleteCascade
): Promise<void> {
  const res = await fetch(
    `/api/project/${encodeURIComponent(projectId)}?cascade=${encodeURIComponent(
      cascade
    )}`,
    { method: "DELETE", credentials: "include" }
  );
  if (!res.ok) throw new Error(await safeText(res));
}

/* Optional cover helpers — wire up only if you have route handlers for these:
   POST /api/project/:id/cover/reset
   POST /api/project/:id/cover { assetId }
*/
export async function resetProjectCover(projectId: string): Promise<void> {
  const res = await fetch(
    `/api/project/${encodeURIComponent(projectId)}/cover/reset`,
    { method: "POST", credentials: "include" }
  );
  if (!res.ok) throw new Error(await safeText(res));
}

export async function setProjectCover(
  projectId: string,
  assetId: string
): Promise<void> {
  const res = await fetch(
    `/api/project/${encodeURIComponent(projectId)}/cover`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId }),
    }
  );
  if (!res.ok) throw new Error(await safeText(res));
}
