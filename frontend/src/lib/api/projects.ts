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

/** GET /api/projects */
export async function listProjects(): Promise<Project[]> {
  const res = await fetch("/api/projects", {
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

/** POST /api/projects */
export async function createProject(input: {
  type: Project["type"];
  title?: string;
  description?: string;
}): Promise<Project> {
  const res = await fetch("/api/projects", {
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
    `/api/project/${encodeURIComponent(projectId)}?cascade=${cascade}`,
    { method: "DELETE", credentials: "include" }
  );
  if (!res.ok) throw new Error(await safeText(res));
}

/* Optional cover helpers — only include if you have matching route handlers:
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
