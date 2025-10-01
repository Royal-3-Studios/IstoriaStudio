// src/app/projects/[projectId]/editor/page.tsx
// server by default (no "use client" here)
import ClientShell from "./ClientShell";

export const dynamic = "force-dynamic";

export default function Page({ params }: { params: { projectId: string } }) {
  return <ClientShell projectId={params.projectId} />;
}
