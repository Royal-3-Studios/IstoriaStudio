import { UUID } from "crypto";
import { PromptLog } from "./promptLog";

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: "Bearer";
}

export interface PromptType {
  id: UUID;
  name: string;
  description?: string;
  icon_url?: string;
  is_active: boolean;
  created_at: string;

  prompts: PromptLog[];
}
