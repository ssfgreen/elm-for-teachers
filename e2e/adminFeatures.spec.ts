/**
 * Feature switches on /admin: a tick in the Features column turns a feature off in the
 * workspace, and the New workspace form starts a workspace with the switches ticked there.
 */
import { expect, test, type Page } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

async function signIn(page: Page) {
  await page.goto("/admin");
  await page.getByLabel("Password").fill("e2e-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Workspaces" })).toBeVisible();
}

test("unticking spyglass on /admin takes the Spyglass toggle out of the workspace", async ({ page, request }) => {
  const label = `E2E features ${Date.now()}`;
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label } });
  const ws = ((await res.json()) as { session: { participant_token: string } }).session;

  // On to begin with.
  await page.goto(`/s/${ws.participant_token}`);
  const chat = page.getByRole("region", { name: "Chat", exact: true });
  await expect(chat.getByRole("button", { name: "Spyglass" })).toBeVisible();

  await signIn(page);
  const row = page.getByRole("row").filter({ hasText: label });
  await expect(row.locator("summary")).toHaveText("Off: pupils");
  await row.locator("summary").click();
  const tick = row.getByRole("checkbox", { name: `spyglass for ${label}` });
  await expect(tick).toBeChecked();
  const saved = page.waitForResponse((r) => r.url().endsWith("/features") && r.request().method() === "PUT");
  await tick.uncheck();
  expect((await saved).ok()).toBe(true);
  await expect(tick).not.toBeChecked();
  await expect(row.locator("summary")).toHaveText("Off: spyglass, pupils");

  // The next load of the workspace has no Spyglass.
  await page.goto(`/s/${ws.participant_token}`);
  await expect(chat.getByLabel("Message")).toBeVisible();
  await expect(chat.getByRole("button", { name: "Spyglass" })).toHaveCount(0);
});

test("a new workspace made with pupils ticked has pupils on", async ({ page, request }) => {
  const label = `E2E pupils ${Date.now()}`;
  await signIn(page);
  const form = page.locator("section").filter({ has: page.getByRole("heading", { name: "New workspace" }) });
  await form.getByLabel("Name (for example the teacher or class)").fill(label);
  const pupils = form.getByRole("checkbox", { name: "pupils", exact: true });
  await expect(pupils).not.toBeChecked();
  await pupils.check();
  await form.getByRole("button", { name: "Create link" }).click();
  await expect(page.getByRole("row").filter({ hasText: label }).locator("summary")).toHaveText("All on");

  const list = (await (await request.get("/api/admin/sessions", { headers: ADMIN })).json()) as { sessions: { label: string; features: Record<string, boolean> }[] };
  const made = list.sessions.find((s) => s.label === label);
  expect(made?.features.pupils).toBe(true);
  expect(made?.features.classes).toBe(true);
});
