import { z } from "zod";
import { FEATURE_NAMES, Features } from "../features.js";

/**
 * An admin changed a workspace's feature switches (server only). `features`: the full set in
 * force afterwards; `changed`: the switches whose value changed (empty when none did); `via`:
 * signed in as an admin account or by the admin password; `account_id`: the admin's account,
 * when signed in with one (absent for the password).
 */
export const WorkspaceFeaturesSetPayload = z.object({
  features: Features,
  changed: z.array(z.enum(FEATURE_NAMES)),
  via: z.enum(["account", "password"]),
  account_id: z.string().min(1).optional(),
});
