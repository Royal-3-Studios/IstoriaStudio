import { Project } from "./project";

export interface ProjectUpdateLog {
  id: string;
  project_id: string;
  updated_at: string;
  updated_by_email?: string;
  change_summary: string;
  project: Project;
}
