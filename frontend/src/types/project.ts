import { GeneratedAsset } from "./generatedAsset";
import { ProjectUpdateLog } from "./projectUpdateLog";
import { PromptLog } from "./promptLog";
import { Tag } from "./tag";
import { User } from "./user";

export interface Project {
  id: string;
  is_archived: boolean;
  title: string;
  type: string;
  status: string;
  description?: string;
  created_at: string;
  is_active: boolean;
  user_id?: string;
  user: User;
  email?: string;
  prompt_logs: PromptLog[];
  assets?: GeneratedAsset[];
  update_logs: ProjectUpdateLog[];
  featured_asset_id?: string | null;
  featured_asset?: Pick<GeneratedAsset, "id" | "thumbnail_url" | "url"> | null;
  tags?: Tag[];
}
