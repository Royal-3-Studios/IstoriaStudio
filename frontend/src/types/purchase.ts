import { UUID } from "crypto";
import { User } from "./user";

export interface Purchase {
  id: string;
  email: string;
  amount: number;
  currency: string;
  is_guest: boolean;
  created_at: string;

  status?: string;
  stripe_payment_intent_id?: string;
  user_id?: UUID;
  user: User;
}
