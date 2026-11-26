import { describe, expect, it } from "vitest";
import { BudgetUpdatePayload } from "./budget.js";

const base = { amount_gbp: 10, budget_before_gbp: 60, budget_after_gbp: 70, spent_gbp: 12.4 };

describe("BudgetUpdatePayload", () => {
  it("reads an older event, and a password top-up, with no account", () => {
    const old = { ...base, via: "password" };
    expect(BudgetUpdatePayload.parse(old)).toEqual(old);
    const oldAccount = { ...base, via: "account" };
    expect(BudgetUpdatePayload.parse(oldAccount)).toEqual(oldAccount);
  });

  it("keeps the admin's account id when one made the top-up", () => {
    const signedIn = { ...base, via: "account", account_id: "acc_1" };
    expect(BudgetUpdatePayload.parse(signedIn)).toEqual(signedIn);
  });
});
