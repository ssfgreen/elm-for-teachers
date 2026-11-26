/**
 * Studio drafts on the Plugins screen (#160), against the stand-in studio (e2e/fake-studio.mjs):
 * the "Open in Elm" link offers its draft and leaves the address bar at once; a pasted address
 * adds one; Remove asks first. The drafts are still there after a reload.
 */
import { expect, test } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };
const STUDIO = "http://127.0.0.1:3953";

test("Plugins: add a draft by link and by paste, then remove one", async ({ page, request }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: "E2E drafts" } });
  const { session } = (await res.json()) as { session: { participant_token: string } };

  // The link opens the Plugins screen with an offer, and the address is gone from the bar.
  await page.goto(`/s/${session.participant_token}#add-draft=${encodeURIComponent(`${STUDIO}/d/linked123`)}`);
  const offer = page.getByRole("group", { name: "Add a draft from the studio" });
  await expect(offer).toBeVisible();
  expect(page.url()).not.toContain("add-draft");
  expect(page.url()).not.toContain("linked123");
  await offer.getByRole("button", { name: "Add" }).click();
  const drafts = page.getByRole("list", { name: "Drafts" });
  await expect(drafts.getByRole("listitem", { name: "Draft linked123" })).toBeVisible();
  await expect(offer).toHaveCount(0);

  // A refusal, then a pasted address.
  const field = page.getByRole("textbox", { name: "Draft address" });
  await field.fill("https://elsewhere.example/d/abcdef");
  await page.getByRole("button", { name: "Add draft" }).click();
  await expect(page.getByRole("alert")).toContainText("Drafts can only be added from the plugin studio");
  await field.fill(`${STUDIO}/d/pasted456`);
  await page.getByRole("button", { name: "Add draft" }).click();
  await expect(drafts.getByRole("listitem", { name: "Draft pasted456" })).toBeVisible();
  await expect(drafts.getByRole("listitem", { name: "Draft pasted456" }).getByText("Draft", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("drafts.png") });

  // Remove asks first.
  const linked = drafts.getByRole("listitem", { name: "Draft linked123" });
  await linked.getByRole("button", { name: "Remove" }).click();
  await linked.getByRole("group", { name: "Remove Draft linked123" }).getByRole("button", { name: "Remove" }).click();
  await expect(linked).toHaveCount(0);

  await page.reload();
  await expect(page.locator(".doc-title")).toHaveText("Untitled");
  await page.getByRole("button", { name: "Plugins", exact: true }).click();
  await expect(page.getByRole("list", { name: "Drafts" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("listitem", { name: "Draft pasted456" })).toBeVisible();
});
