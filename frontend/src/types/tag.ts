import { Project } from "./project";

export interface Tag {
  id: string;
  name: string;
  projects: Project;
}
