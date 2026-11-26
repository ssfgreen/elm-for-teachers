/**
 * The two looks of a suggestion (12 Nov 2026): Suggesting shows only the words added, in green,
 * and leaves a thin mark where words go; Track changes shows the words added and taken out, both
 * in red. The mock adds words for "simpler" and takes the first word out for "shorter". See
 * playwright.config.ts.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

/** @model on a paragraph, and wait for the turn to end (the doc is locked while it streams). */
async function askAbout(page: Page, para: Locator, text: string, cards: number) {
  await para.click({ clickCount: 3 });
  await page.getByRole("button", { name: "@model" }).first().click();
  const chat = page.getByRole("region", { name: "Chat", exact: true });
  await chat.getByLabel("Message").fill(text);
  await chat.getByRole("button", { name: /send/i }).click();
  await expect(page.locator(".suggestion-card")).toHaveCount(cards, { timeout: 20_000 });
}

const look = (l: Locator) =>
  l.evaluate((el) => ({ colour: getComputedStyle(el).color, line: getComputedStyle(el).textDecorationLine, width: el.getBoundingClientRect().width }));

test("Suggesting shows only the new words in green; Track changes shows both, in red", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: "E2E suggestion looks" } });
  const ws = ((await res.json()) as { session: { participant_token: string } }).session;
  await page.goto(`/s/${ws.participant_token}`);
  await expect(page.locator(".doc-title")).toHaveText("Untitled");

  await page.locator(".canvas-pm").click();
  await page.keyboard.type("Her voice was like silk.", { delay: 20 });
  await page.keyboard.press("Enter");
  await page.keyboard.type("The sea was a mirror.", { delay: 20 });
  await page.waitForTimeout(800);
  const paras = page.locator(".canvas-pm > p");
  await askAbout(page, paras.nth(1), "Make this simpler", 1);
  await askAbout(page, paras.nth(0), "Make this shorter", 2);
  const added = page.locator(".canvas-pm .sg-ins");
  const gone = page.locator(".canvas-pm .sg-del");
  await expect(added).toHaveText(["(clearer version)"]);
  await expect(gone).toHaveCount(1);

  // Suggesting, the default: green and not underlined, so the doc reads as it would accepted;
  // the word taken out is a thin mark only, and its card says what goes.
  const chat = page.getByRole("region", { name: "Chat", exact: true });
  await expect(chat.getByRole("button", { name: "Assistant: Suggesting" })).toBeVisible();
  expect(await look(added)).toMatchObject({ colour: "rgb(23, 102, 58)", line: "none" });
  expect(await look(gone)).toMatchObject({ colour: "rgba(0, 0, 0, 0)" });
  expect((await look(gone)).width).toBeLessThanOrEqual(4);
  await expect(page.locator(".suggestion-card").filter({ hasText: "Her" })).toHaveCount(1);

  // Track changes: both shown and both red, added underlined and taken out struck through.
  await chat.getByRole("button", { name: "Assistant: Suggesting" }).click();
  await page.getByRole("menuitemradio", { name: /^Track changes/ }).click();
  expect(await look(added)).toMatchObject({ colour: "rgb(180, 35, 24)", line: "underline" });
  expect(await look(gone)).toMatchObject({ colour: "rgb(180, 35, 24)", line: "line-through" });
  expect((await look(gone)).width).toBeGreaterThan(10);

  // Remembered after a reload.
  await page.reload();
  await expect(chat.getByRole("button", { name: "Assistant: Track changes" })).toBeVisible();
  expect(errors, "uncaught errors in the page").toEqual([]);
});
