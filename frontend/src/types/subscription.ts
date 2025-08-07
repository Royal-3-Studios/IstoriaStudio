import { UUID } from "crypto";
import { User } from "./user";

export interface Plan {
  id: string;
  name: string;
  price: number;
  generation_limit: number;
  description?: string;
}

export interface Subscription {
  id: string;
  user_id: UUID;
  user: User;
  plan_id: UUID;
  plan?: Plan;
  stripe_customer_id: UUID;
  stripe_subscription_id: UUID;
  active: boolean;
  created_at: string;
  ends_at: string;
}
