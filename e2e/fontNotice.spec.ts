/**
 * OpenDyslexic in a real browser: the bundled font draws the doc, and the Word download warns
 * that a reader needs it installed, until the teacher ticks "Don't show this again".
 */
import { expect, test } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

test("a doc set in OpenDyslexic is drawn in it, and the Word download warns once", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: "E2E OpenDyslexic" } });
  const ws = ((await res.json()) as { session: { participant_token: string } }).session;
  await page.goto(`/s/${ws.participant_token}`);
  await expect(page.locator(".doc-title")).toHaveText("Untitled");
  await page.locator(".canvas-pm").click();
  await page.keyboard.type("Read the sentence.");

  await page.getByRole("button", { name: "Document font: Calibri" }).click();
  await page.getByRole("menu", { name: "Document font" }).getByRole("menuitemradio", { name: "OpenDyslexic" }).click();
  await expect(page.getByRole("button", { name: "Document font: OpenDyslexic" })).toBeVisible();
  // The bundled font, not a fallback.
  await expect.poll(() => page.evaluate(async () => (await document.fonts.load("16px OpenDyslexic")).length)).toBeGreaterThan(0);

  const downloadWord = async () => {
    await page.getByRole("button", { name: "Download" }).click();
    await page.getByRole("menuitem", { name: "Word (.docx)" }).click();
  };
  await downloadWord();
  const notice = page.getByRole("dialog", { name: "This document uses OpenDyslexic" });
  await expect(notice).toBeVisible();
  await expect(notice.getByRole("link", { name: "opendyslexic.org" })).toHaveAttribute("href", "https://opendyslexic.org");
  await notice.getByRole("checkbox", { name: "Don't show this again" }).check();
  const first = page.waitForEvent("download");
  await notice.getByRole("button", { name: "Download" }).click();
  expect((await first).suggestedFilename()).toBe("Untitled.docx");
  await expect(notice).toBeHidden();

  // Ticked: straight to the file next time.
  const second = page.waitForEvent("download");
  await downloadWord();
  expect((await second).suggestedFilename()).toBe("Untitled.docx");
  await expect(page.getByRole("dialog", { name: /This document uses/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});
