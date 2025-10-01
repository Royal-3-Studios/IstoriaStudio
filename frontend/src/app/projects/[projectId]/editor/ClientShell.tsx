// src/app/projects/[projectId]/editor/ClientShell.tsx
"use client";
import dynamic from "next/dynamic";

const EditorScreen = dynamic(() => import("@features/editor/EditorScreen"), {
  ssr: false,
});

export default function ClientShell({ projectId }: { projectId: string }) {
  return <EditorScreen projectId={projectId} />;
}
