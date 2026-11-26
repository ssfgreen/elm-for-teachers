/**
 * Plugins (docs/plugins.md): the teacher browses the plugins, searches them, and sets how the
 * assistant may use each. The level is saved for the workspace and is still there after a reload.
 */
import { expect, test } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

test("Plugins: browse and search the plugins, turn the pictures off, and it stays off", async ({ page, request }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: "E2E plugins" } });
  const { session } = (await res.json()) as { session: { participant_token: string } };
  await page.goto(`/s/${session.participant_token}`);
  await expect(page.locator(".doc-title")).toHaveText("Untitled");

  await page.getByRole("button", { name: "Plugins", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Plugins", level: 1 })).toBeVisible();
  const pictures = page.getByRole("listitem", { name: "ARASAAC pictures" });
  await expect(pictures).toBeVisible();
  // The e2e run has a library server (playwright.config.ts), so the libraries are set up.
  // Without one they read "Not set up yet" (PluginsScreen.test.tsx).
  await expect(page.getByRole("listitem", { name: "TRAILS" })).toBeVisible();
  await expect(page.getByRole("listitem", { name: "TRAILS" }).getByText("Not set up yet")).toHaveCount(0);
  await expect(page.getByRole("listitem", { name: "Pedagogy library (draft)" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("plugins.png") });

  await page.getByRole("searchbox", { name: "Search plugins" }).fill("curriculum scotland");
  await expect(page.getByRole("listitem", { name: "Experiences and outcomes" })).toBeVisible();
  await expect(pictures).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search plugins" }).fill("");

  await pictures.getByText("Off", { exact: true }).click();
  await expect(pictures.getByText("The assistant never uses it.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Plugins", exact: true }).click();
  await expect(page.getByRole("listitem", { name: "ARASAAC pictures" }).getByRole("radio", { name: "Off" })).toBeChecked();

  // Back to the editor from a chat in the sidebar.
  await page.getByRole("navigation", { name: "Chats" }).getByRole("button", { name: /Untitled/ }).first().click();
  await expect(page.locator(".doc-title")).toBeVisible();
});
