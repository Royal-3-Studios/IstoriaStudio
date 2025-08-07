import { UUID } from "crypto";
import { User } from "./user";
import { AssetType } from "./assetType";

export interface Template {
  id: string;
  name: string;
  description?: string;
  asset_type_id: UUID;
  asset_type: AssetType;
  user_id: UUID;
  user: User;
  is_public: boolean;
  preview_url?: string;
  default_prompt?: string;
  style_json: JSON;
  example_overlay?: string;
  created_at: string;
}
