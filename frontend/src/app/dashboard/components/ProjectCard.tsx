import { Project } from "@/types/project";
import Link from "next/link";

export function ProjectCard({ project }: { project: Project }) {
  return (
    <div className="p-4 border rounded-md shadow hover:shadow-lg transition">
      <h2 className="text-xl font-semibold">{project.title}</h2>
      <p className="text-sm text-gray-500">
        {new Date(project.created_at).toLocaleDateString()}
      </p>
      <Link
        href={`/projects/${project.id}/editor`}
        className="inline-block mt-2 text-blue-600 underline"
      >
        Open
      </Link>
    </div>
  );
}
