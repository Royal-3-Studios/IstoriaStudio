import { UUID } from "crypto";

import { Subscription } from "./subscription";

export interface Plan {
  id: UUID;
  name: string;
  description: string;
  stripe_price_id: string;
  monthly_price_cents: number;
  is_active: boolean;
  max_generations_per_month: number;
  priority_gpu: boolean;
  subscriptions: Subscription[];
}
