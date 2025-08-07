import { Project } from "./project";
import { Purchase } from "./purchase";
import { Subscription } from "./subscription";

export interface User {
  id: string;
  email: string;
  stripe_customer_id: string;
  business_name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  username?: string;
  is_business?: boolean;
  created_at: string;
  hashed_password: string;
  subscription: Subscription;
  projects: Project[];
  purchases: Purchase[];
  templates: User[];
}
