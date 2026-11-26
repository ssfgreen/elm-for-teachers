/**
 * Spyglass in a real browser: the callout under a reply that changed a block, Show, and the
 * toggle under the chat box, kept after a reload. The mock's judge flags every change and removal.
 */
import { expect, test, type Page } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

/** A worksheet, accepted, then an @model ask on its first paragraph (the mock rewords that block). */
/** `replies`: how many replies the chat has after this one (counted, not read, as a reload loads them late). */
async function askAboutAParagraph(page: Page, prompt: string, replies: number) {
  const chat = page.getByRole("region", { name: "Chat", exact: true });
  const para = page.locator(".canvas-pm p").filter({ hasText: /\w/ }).first();
  await para.click({ clickCount: 3 });
  await page.getByRole("button", { name: "@model" }).first().click();
  await chat.getByLabel("Message").fill(prompt);
  await chat.getByRole("button", { name: /send/i }).click();
  await expect(chat.locator(".chat-assistant:not(.chat-draft)")).toHaveCount(replies, { timeout: 20_000 });
  await expect(page.locator(".canvas-pm")).toContainText("(clearer version)");
}

test("the callout under a reply, Show, and the toggle kept after a reload", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: "E2E Spyglass" } });
  const ws = ((await res.json()) as { session: { session_id: string; participant_token: string } }).session;
  /** The spyglass_shown events so far, from the research export. */
  const shown = async () => {
    const files = (await (await request.get(`/api/admin/sessions/${ws.session_id}/export.json`, { headers: ADMIN })).json()) as Record<string, string>;
    return files["events.jsonl"]!.trim().split("\n").map((l) => JSON.parse(l) as { kind: string; payload: { hidden?: string; flags: unknown[] } }).filter((e) => e.kind === "spyglass_shown");
  };
  await page.goto(`/s/${ws.participant_token}`);

  const chat = page.getByRole("region", { name: "Chat", exact: true });
  const toggle = chat.getByRole("button", { name: "Spyglass" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  // A line of the teacher's first: a blank doc takes the turn straight in, with no suggestions.
  await page.locator(".canvas-pm").click();
  await page.keyboard.type("My notes for the lesson.", { delay: 20 });
  await page.waitForTimeout(800);
  await chat.getByLabel("Message").fill("Please write the worksheet on metaphors and similes");
  await chat.getByRole("button", { name: /send/i }).click();
  await expect(chat).toContainText(/draft worksheet/i, { timeout: 20_000 });
  // Only additions: the mock's judge flags none, so there is no callout.
  await expect(chat.getByRole("complementary", { name: "Spyglass" })).toHaveCount(0);
  await page.getByRole("toolbar", { name: "Suggestions" }).getByRole("button", { name: /accept all/i }).click();
  await expect(page.locator(".suggestion-card")).toHaveCount(0);

  // A change to a block: flagged under the reply, and still there after a reload.
  await askAboutAParagraph(page, "Make this simpler", 2);
  const callout = chat.getByRole("complementary", { name: "Spyglass" });
  await expect(callout).toBeVisible({ timeout: 20_000 });
  await expect(callout).toContainText("(mock) Not asked for.");
  await page.reload();
  await expect(chat.getByRole("complementary", { name: "Spyglass" })).toBeVisible();

  // Show: no Dismiss, and the click is logged.
  await expect(chat.getByRole("button", { name: /^Dismiss/ })).toHaveCount(0);
  await chat.getByRole("complementary", { name: "Spyglass" }).getByRole("button", { name: /^Show/ }).first().click();

  // Off: kept after a reload, and the next change gets no callout.
  await page.getByRole("toolbar", { name: "Suggestions" }).getByRole("button", { name: /accept all/i }).click();
  await expect(page.locator(".suggestion-card")).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(chat.getByRole("button", { name: "Spyglass" })).toHaveAttribute("aria-pressed", "false");
  const judged = (await shown()).length;
  await askAboutAParagraph(page, "Make this simpler again", 3);
  // Still judged and recorded, as hidden by the teacher; nothing new shown (the earlier callout stays).
  await expect.poll(async () => (await shown()).slice(judged).map((e) => e.payload.hidden), { timeout: 20_000 }).toEqual(["teacher_off"]);
  await expect(chat.getByRole("complementary", { name: "Spyglass" })).toHaveCount(1);
  expect(errors).toEqual([]);
});
