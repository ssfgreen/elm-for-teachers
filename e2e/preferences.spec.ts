/**
 * Preferences: the teacher writes a note about themselves and picks a default font. Both are
 * kept after a reload, and a new document starts in the font.
 */
import { expect, test } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

test("Preferences: a note and a default font are kept, and a new chat's doc starts in the font", async ({ page, request }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: "E2E preferences" } });
  const { session } = (await res.json()) as { session: { participant_token: string } };
  await page.goto(`/s/${session.participant_token}`);
  await expect(page.locator(".doc-title")).toHaveText("Untitled");

  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Preferences", level: 1 })).toBeVisible();
  const note = page.getByRole("textbox", { name: "About you" });
  await note.fill("I teach P5 in Glasgow.");
  await page.getByRole("heading", { name: "Default font" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByText("Lexend", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "Lexend" })).toBeChecked();
  await page.screenshot({ path: info.outputPath("preferences.png") });

  // Usage: nothing spent yet in a new workspace, and the range can be switched.
  await expect(page.getByText(/^£0 of £\d+ used$/)).toBeVisible();
  await expect(page.getByText("Nothing spent this week.")).toBeVisible();
  await page.getByText("All time", { exact: true }).click();
  await expect(page.getByText("Nothing spent yet.")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "About you" })).toHaveValue("I teach P5 in Glasgow.");
  await expect(page.getByRole("radio", { name: "Lexend" })).toBeChecked();

  // A new chat's doc starts in Lexend.
  await page.getByRole("button", { name: "New chat" }).click();
  await expect(page.locator(".doc-title")).toBeVisible();
  await expect(page.getByRole("button", { name: "Document font: Lexend" })).toBeVisible();
});
