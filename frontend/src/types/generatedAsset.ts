import { UUID } from "crypto";
import { User } from "./user";
import { Project } from "./project";
import { AssetType } from "./assetType";
import { Template } from "./template";

export interface StyleJson {
  font?: string;
  color?: string;
  [key: string]: unknown;
}

export interface TextOverlay {
  text: string;
  position: { x: number; y: number };
  fontSize: number;
  color?: string;
  [key: string]: unknown;
}

export interface GeneratedAsset {
  id: string;
  url: string;
  is_archived?: boolean;
  format?: string;
  thumbnail_url?: string;
  name?: string;
  resolution: string;
  version: number;
  revision_of_id?: UUID;
  file_size?: number;
  style_json?: StyleJson;
  text_overlays?: TextOverlay[];
  created_at: string;
  project_id: string;
  asset_type_id: UUID;
  user_id: UUID;
  user: User;
  project: Project;
  asset_type: AssetType;
  template_id: UUID;
  template: Template;
}
