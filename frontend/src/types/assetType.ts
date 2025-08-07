import { GeneratedAsset } from "./generatedAsset";
import { Template } from "./template";

export interface AssetType {
  id: string;
  name: string;
  description?: string;
  icon_url?: string;
  is_active: boolean;

  assets: GeneratedAsset[];
  templates: Template[];
}
