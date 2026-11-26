/**
 * End-to-end verification of the post-split Elm for Teachers flows:
 * - Needs Groups creation, PII rejection on save, and starting a chat
 * - One-way Content Pack v1 export via "Send to Elm for Students" and revocation
 */
import { expect, test } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

test("needs groups UI creates a group, blocks PII, and exports a one-way Content Pack v1 link", async ({ page, request }) => {
  const created = await request.post("/api/admin/sessions", {
    headers: ADMIN,
    data: { label: `Split E2E ${Date.now()}` },
  });
  expect(created.status()).toBe(201);
  const { participant_url } = (await created.json()) as { participant_url: string };

  await page.goto(participant_url);
  await expect(page.getByRole("button", { name: "Needs groups" })).toBeVisible();

  // Open Needs groups, verify PII is refused, then create a clean needs group.
  await page.getByRole("button", { name: "Needs groups" }).click();
  await expect(page.getByRole("heading", { name: "Needs groups" })).toBeVisible();

  await page.getByLabel("Group name").fill("Reading support");
  await page.getByLabel("Learning barriers (optional)").fill("Pupil: Oliver Grant struggles with decoding");
  await page.getByRole("button", { name: "Add needs group" }).click();
  await expect(page.getByRole("alert")).toContainText("pupil name");

  await page.getByLabel("Learning barriers (optional)").fill("Longer decoding times across P7 literacy.");
  await page.getByLabel("What helps (optional)").fill("Chunked instructions and word banks.");
  await page.getByRole("button", { name: "Add needs group" }).click();
  await expect(page.getByRole("heading", { name: "Reading support" })).toBeVisible();

  // Start a chat for the needs group, type content into the doc, and export a Content Pack v1 link.
  await page.getByRole("button", { name: "Start chat" }).click();
  const editor = page.locator(".ProseMirror");
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type("The water cycle moves water between oceans, sky, and land.");
  // Wait for block sync to settle before exporting.
  await page.waitForTimeout(800);

  await page.getByRole("button", { name: "Send to Elm for Students" }).click();
  const dialog = page.getByRole("dialog", { name: "Send to Elm for Students" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Create link" }).click();

  const linkInput = dialog.getByLabel("Content pack import link");
  await expect(linkInput).toBeVisible();
  const packUrl = await linkInput.inputValue();
  expect(packUrl).toContain("/api/packs/");

  // Capability download works twice (Safe Links resilient), then returns 410 after revoke.
  const dl1 = await request.get(packUrl);
  expect(dl1.status()).toBe(200);
  expect(dl1.headers()["content-type"]).toContain("application/zip");
  const dl2 = await request.get(packUrl);
  expect(dl2.status()).toBe(200);

  await dialog.getByRole("button", { name: "Revoke" }).click();
  await expect(linkInput).toHaveCount(0);
  const afterRevoke = await request.get(packUrl);
  expect(afterRevoke.status()).toBe(410);
});
