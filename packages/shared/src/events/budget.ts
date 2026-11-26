import { z } from "zod";

/**
 * An admin added to the workspace's budget on /admin (server only; Sam agreed the payload on 14
 * Nov 2026). The budget is config `limits.budget_gbp` plus every top-up; there is no undo.
 * `budget_before_gbp` and `budget_after_gbp`: the budget either side of this top-up;
 * `spent_gbp`: the workspace's spend at the time, from the stored cost of each model call;
 * `via`: signed in as an admin account or by the admin password; `account_id`: the admin's account,
 * when signed in (from 15 Nov 2026; a password top-up, and earlier events, have none).
 */
export const BudgetUpdatePayload = z.object({
  amount_gbp: z.number().positive(),
  budget_before_gbp: z.number().nonnegative(),
  budget_after_gbp: z.number().nonnegative(),
  spent_gbp: z.number().nonnegative(),
  via: z.enum(["account", "password"]),
  account_id: z.string().min(1).optional(),
});
