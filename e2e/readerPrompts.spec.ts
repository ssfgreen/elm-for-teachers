/**
 * The reader's prompt library (#177) at /s/:token/prompts: it starts with config's defaults; a
 * prompt added with its ticks, and a new order, are still there after a reload.
 */
import { expect, test, type Page } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

const labels = (page: Page) => page.getByRole("list", { name: "Prompts" }).getByRole("listitem");

test("add a prompt, tick its boxes, reorder, reload: still there", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: "E2E prompt library" } });
  const ws = ((await res.json()) as { session: { participant_token: string } }).session;

  await page.goto(`/s/${ws.participant_token}/prompts`);
  await expect(page.getByRole("heading", { name: "Prompt library" })).toBeVisible();
  // Config's defaults, from Sam's examples.
  await expect(labels(page)).toHaveCount(2);
  await expect(labels(page).first()).toHaveAttribute("aria-label", "Explain");

  // Add one, with both boxes ticked.
  const form = page.getByRole("region", { name: "Add a prompt" });
  await form.getByRole("textbox", { name: "Button pupils see" }).fill("Picture it");
  await form.getByRole("textbox", { name: /Instruction to the assistant/ }).fill("Describe a picture that shows this idea, for a pupil aged 9.");
  await form.getByRole("checkbox", { name: "As a follow-up" }).check();
  await form.getByRole("button", { name: "Add prompt" }).click();
  await expect(labels(page)).toHaveCount(3);
  const added = page.getByRole("listitem", { name: "Picture it" });
  await expect(added.getByRole("checkbox", { name: "After a highlight" })).toBeChecked();
  await expect(added.getByRole("checkbox", { name: "As a follow-up" })).toBeChecked();

  // Untick one on the card, and move the new prompt to the top.
  const saved = page.waitForResponse((r) => r.request().method() === "PATCH" && r.ok());
  await added.getByRole("checkbox", { name: "After a highlight" }).uncheck();
  await saved;
  for (let i = 0; i < 2; i++) {
    const moved = page.waitForResponse((r) => r.url().endsWith("/reader-prompts/order") && r.ok());
    await page.getByRole("button", { name: "Move Picture it up" }).click();
    await moved;
  }
  await expect(labels(page).first()).toHaveAttribute("aria-label", "Picture it");

  await page.reload();
  await expect(labels(page)).toHaveCount(3);
  const order = await labels(page).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
  expect(order).toEqual(["Picture it", "Explain", "I don't understand"]);
  const after = page.getByRole("listitem", { name: "Picture it" });
  await expect(after.getByRole("checkbox", { name: "After a highlight" })).not.toBeChecked();
  await expect(after.getByRole("checkbox", { name: "As a follow-up" })).toBeChecked();
  await expect(after).toContainText("Describe a picture that shows this idea");
  expect(errors).toEqual([]);
});
