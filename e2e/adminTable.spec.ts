/**
 * The workspace table on /admin: at 1366px it fits inside its card; narrower, it scrolls
 * sideways inside the card, not the page. Deleting a workspace asks for DELETE to be typed.
 */
import { expect, test, type Page } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

async function signIn(page: Page) {
  await page.goto("/admin");
  await page.getByLabel("Password").fill("e2e-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Workspaces" })).toBeVisible();
}

/** The workspace table (the page also has tables of invites and admins). */
const workspaces = (page: Page) => page.getByRole("table").filter({ has: page.getByRole("columnheader", { name: "Access code" }) });

/** How far the workspace table runs past its card, and the page past the window. */
async function overflow(page: Page) {
  return workspaces(page).evaluate((table) => {
    const card = table.closest("section")!;
    const doc = document.documentElement;
    return { card: card.scrollWidth - card.clientWidth, page: doc.scrollWidth - doc.clientWidth };
  });
}

test("the workspace table fits its card at 1366px, and scrolls inside it when narrower", async ({ page, request }) => {
  const label = `E2E table ${Date.now()}`;
  await request.post("/api/admin/sessions", { headers: ADMIN, data: { label } });
  await page.setViewportSize({ width: 1366, height: 900 });
  await signIn(page);
  const row = page.getByRole("row").filter({ hasText: label });
  await row.getByRole("button", { name: `Show the access code for ${label}` }).click();
  await expect(row.locator("code")).toBeVisible();
  expect(await overflow(page)).toEqual({ card: 0, page: 0 });
  await workspaces(page).screenshot({ path: test.info().outputPath("admin-table-1366.png") });

  // Each confirm opens in place and keeps within the card.
  await row.getByRole("button", { name: `Replace the link for ${label}` }).click();
  expect(await overflow(page)).toEqual({ card: 0, page: 0 });
  await row.getByRole("button", { name: "Cancel" }).click();
  await row.getByRole("button", { name: `Delete ${label}` }).click();
  expect(await overflow(page)).toEqual({ card: 0, page: 0 });
  await row.getByRole("button", { name: "Cancel" }).click();

  await page.setViewportSize({ width: 800, height: 900 });
  const narrow = await overflow(page);
  expect(narrow.page).toBe(0);
  expect(narrow.card).toBeGreaterThan(0);
});

test("deleting a workspace waits for DELETE to be typed", async ({ page, request }) => {
  const label = `E2E delete ${Date.now()}`;
  await request.post("/api/admin/sessions", { headers: ADMIN, data: { label } });
  await signIn(page);
  const row = page.getByRole("row").filter({ hasText: label });
  await row.getByRole("button", { name: `Delete ${label}` }).click();
  const confirm = row.getByRole("button", { name: "Delete for good" });
  const box = row.getByRole("textbox", { name: `Type DELETE to delete ${label}` });
  await expect(confirm).toBeDisabled();
  await box.fill("delete");
  await box.press("Enter");
  await expect(confirm).toBeDisabled();
  await expect(row).toBeVisible();
  await box.fill("DELETE");
  await confirm.click();
  await expect(page.getByRole("row").filter({ hasText: label })).toHaveCount(0);
  const { sessions } = (await (await request.get("/api/admin/sessions", { headers: ADMIN })).json()) as { sessions: { label: string }[] };
  expect(sessions.some((s) => s.label === label)).toBe(false);
});
