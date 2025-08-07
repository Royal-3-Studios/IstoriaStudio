import { UUID } from "crypto";
import { Project } from "./project";
import { PromptType } from "./promptType";

export interface PromptLog {
  id: string;
  prompt_input: JSON;
  prompt_output: string;
  email: string;
  created_at: string;
  project_id: UUID;
  project: Project;
  prompt_type_id: UUID;
  prompt_type: PromptType;
}
