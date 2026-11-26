/**
 * Budget top-ups in a real browser: "Add £10" on /admin raises the workspace's budget, and the
 * chat head shows what is left in whole pounds.
 */
import { expect, test } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

test("an admin adds £10 and the chat shows the new amount left", async ({ page, request }) => {
  const label = `E2E budget ${Date.now()}`;
  const created = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label } });
  const ws = ((await created.json()) as { session: { session_id: string; participant_token: string } }).session;
  const budget = ((await (await request.get(`/api/sessions/${ws.session_id}/budget`, { headers: { Authorization: `Bearer ${ws.participant_token}` } })).json()) as { spent_gbp: number; budget_gbp: number });
  const left = (b: number) => `£${Math.floor(b - budget.spent_gbp)} left`;

  await page.goto(`/s/${ws.participant_token}`);
  const chat = page.getByRole("region", { name: "Chat", exact: true });
  await expect(page.getByText(left(budget.budget_gbp))).toBeVisible();

  await page.goto("/admin");
  await page.getByLabel("Password").fill("e2e-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  const row = page.getByRole("row").filter({ hasText: label });
  await expect(row).toContainText(`£${budget.spent_gbp.toFixed(2)} of £${budget.budget_gbp}`);
  await row.getByRole("button", { name: `Add £10 to the budget for ${label}` }).click();
  await expect(row).toContainText(`£${budget.spent_gbp.toFixed(2)} of £${budget.budget_gbp + 10}`);

  await page.goto(`/s/${ws.participant_token}`);
  await expect(chat).toBeVisible();
  await expect(page.getByText(left(budget.budget_gbp + 10))).toBeVisible();
});
