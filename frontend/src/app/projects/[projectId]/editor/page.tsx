// src/app/projects/[projectId]/editor/page.tsx
import EditorScreen from "@/features/editor/EditorScreen";

export default async function ProjectEditorPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params; // ✅ await the async params (Next 15 dynamic API)
  return <EditorScreen projectId={projectId} />;
}
