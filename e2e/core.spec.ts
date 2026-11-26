/**
 * The core teacher flow in a real browser: open a workspace link, ask the chat for a
 * worksheet, accept the suggestions, comment with @model, and export. A blank doc takes the
 * assistant's turn straight in, so the tests of suggestions type a line first (`typeALine`). The mock provider
 * answers, so this needs no keys. See playwright.config.ts.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

async function newWorkspace(request: APIRequestContext, label: string) {
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label } });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { session: { session_id: string; participant_token: string } };
  return body.session;
}

async function exportFiles(request: APIRequestContext, sessionId: string) {
  const res = await request.get(`/api/admin/sessions/${sessionId}/export.json`, { headers: ADMIN });
  expect(res.ok()).toBe(true);
  return (await res.json()) as Record<string, string>;
}

/** A line of the teacher's own in the open doc, and time for it to reach the server. */
async function typeALine(page: Page) {
  await page.locator(".canvas-pm").click();
  await page.keyboard.type("My notes for the lesson.", { delay: 20 });
  await page.waitForTimeout(800);
}

const eventKinds = (files: Record<string, string>) =>
  new Set(files["events.jsonl"]!.trim().split("\n").map((l) => (JSON.parse(l) as { kind: string }).kind));

test("ask, accept, comment with @model, export", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const ws = await newWorkspace(request, "E2E core flow");
  await page.goto(`/s/${ws.participant_token}`);
  await expect(page.locator(".doc-title")).toHaveText("Untitled");

  // Ask: the doc has a line of the teacher's, so the mock provider's worksheet comes as suggestions.
  await typeALine(page);
  const chat = page.getByRole("region", { name: "Chat", exact: true });
  await chat.getByLabel("Message").fill("Please write the worksheet on metaphors and similes");
  await chat.getByRole("button", { name: /send/i }).click();
  await expect(chat).toContainText(/draft worksheet/i, { timeout: 20_000 });

  // Accept every suggestion.
  const suggestions = page.getByRole("toolbar", { name: "Suggestions" });
  await expect(suggestions).toBeVisible();
  // Each suggestion is a card in the comments column, and underlined in the document.
  expect(await page.locator(".suggestion-card").count()).toBeGreaterThan(5);
  await expect(page.locator(".canvas-pm > .st-proposed").first()).toBeVisible();
  await suggestions.getByRole("button", { name: /accept all/i }).click();
  await expect(page.locator(".suggestion-card")).toHaveCount(0);
  await expect(page.locator(".canvas-pm > .st-proposed")).toHaveCount(0);

  // @model on a passage: select a paragraph, press @model, and the chat box opens anchored to it.
  const para = page.locator(".canvas-pm p").filter({ hasText: /\w/ }).first();
  await para.click({ clickCount: 3 });
  await page.getByRole("button", { name: "@model" }).first().click();
  await expect(chat.getByText("@model", { exact: true })).toBeVisible();
  await chat.getByLabel("Message").fill("Make this simpler");
  await chat.getByRole("button", { name: /send/i }).click();
  // The mock answers an anchored prompt with a replace of that block: one new suggestion.
  await expect(page.locator(".canvas-pm")).toContainText("(clearer version)", { timeout: 20_000 });
  // One card, and the change shown as tracked changes; accepted from its card.
  const card = page.locator(".suggestion-card");
  await expect(card).toHaveCount(1);
  await expect(page.locator(".canvas-pm .sg-ins").first()).toBeVisible();
  // Typing at the end of the suggested words joins the suggestion, as in Word: it stays waiting.
  // Click the end of the suggested words: they may wrap onto a second line, so the end of their last line.
  const end = await page.locator(".canvas-pm .sg-ins").first().evaluate((el) => {
    const r = Array.from(el.getClientRects()).pop()!;
    return { x: r.right - 2, y: r.top + r.height / 2 };
  });
  await page.mouse.click(end.x, end.y);
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await expect(page.locator(".canvas-pm .sg-ins").first()).toContainText("(clearer version)!");
  await expect(card).toHaveCount(1);
  await page.waitForTimeout(1500);
  await card.getByRole("button", { name: /^Accept/ }).click();
  await expect(card).toHaveCount(0);
  await expect(page.locator(".canvas-pm .sg-ins, .canvas-pm .sg-del")).toHaveCount(0);
  await expect(page.locator(".canvas-pm")).toContainText("(clearer version)!");
  // The server has the same: after a reload the text is there and nothing waits.
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.locator(".canvas-pm")).toContainText("(clearer version)!");
  await expect(page.locator(".suggestion-card")).toHaveCount(0);

  // The export holds the doc and the research events.
  await expect
    .poll(async () => {
      const kinds = eventKinds(await exportFiles(request, ws.session_id));
      return ["chat_prompt", "chat_response", "proposal_shown", "proposal_accept"].every((k) => kinds.has(k));
    }, { timeout: 15_000 })
    .toBe(true);
  const files = await exportFiles(request, ws.session_id);
  expect(Object.keys(files).some((f) => f.startsWith("docs/"))).toBe(true);

  expect(errors, "uncaught errors in the page").toEqual([]);
});

test("the assistant suggests a page colour, and the teacher accepts it in the comments column", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const ws = await newWorkspace(request, "E2E style suggestion");
  await page.goto(`/s/${ws.participant_token}`);
  await expect(page.locator(".doc-title")).toHaveText("Untitled");

  await typeALine(page);
  const chat = page.getByRole("region", { name: "Chat", exact: true });
  await chat.getByLabel("Message").fill("Update the background to light green");
  await chat.getByRole("button", { name: /send/i }).click();
  const card = page.getByRole("region", { name: "Suggested style" });
  await expect(card).toContainText("Page colour: Pale green", { timeout: 20_000 });

  await card.getByRole("button", { name: "Accept the suggested style" }).click();
  await expect(card).toHaveCount(0);
  await expect(page.locator("[style*='--paper-green']").first()).toBeVisible();
  await expect
    .poll(async () => eventKinds(await exportFiles(request, ws.session_id)).has("style_accept"), { timeout: 15_000 })
    .toBe(true);
  expect(errors, "uncaught errors in the page").toEqual([]);
});

test("a blank doc takes the assistant's changes straight in; once it has text, they are suggestions", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const ws = await newWorkspace(request, "E2E blank doc");
  await page.goto(`/s/${ws.participant_token}`);
  await expect(page.locator(".doc-title")).toHaveText("Untitled");
  const chat = page.getByRole("region", { name: "Chat", exact: true });
  await expect(chat.getByRole("button", { name: "Assistant: Suggesting" })).toBeVisible();

  // The page colour too: the reply does not ask the teacher to accept it.
  await chat.getByLabel("Message").fill("Update the background to light green");
  await chat.getByRole("button", { name: /send/i }).click();
  await expect(chat).toContainText("I have made the page pale green.", { timeout: 20_000 });
  await expect(page.locator("[style*='--paper-green']").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Suggested style" })).toHaveCount(0);

  // Still blank (a page colour does not count): the worksheet goes straight in.
  await chat.getByLabel("Message").fill("Please write the worksheet on metaphors and similes");
  await chat.getByRole("button", { name: /send/i }).click();
  await expect(chat).toContainText(/draft worksheet/i, { timeout: 20_000 });
  await expect(page.locator(".canvas-pm h1, .canvas-pm h2").first()).toBeVisible();
  await expect(page.locator(".canvas-pm > .st-proposed, .canvas-pm > [class*='pending-']")).toHaveCount(0);
  await expect(page.locator(".suggestion-card")).toHaveCount(0);
  await expect(page.getByRole("toolbar", { name: "Suggestions" })).toHaveCount(0);
  // The same after a reload: it is the server's doc, not only the screen.
  await page.reload();
  await expect(page.locator(".canvas-pm h1, .canvas-pm h2").first()).toBeVisible();
  await expect(page.locator(".suggestion-card")).toHaveCount(0);

  // The doc has text now: the next change waits as suggestions.
  await chat.getByLabel("Message").fill("Please make it easier for my class");
  await chat.getByRole("button", { name: /send/i }).click();
  await expect(page.getByRole("toolbar", { name: "Suggestions" })).toBeVisible({ timeout: 20_000 });
  expect(await page.locator(".suggestion-card").count()).toBeGreaterThan(0);
  expect(errors, "uncaught errors in the page").toEqual([]);
});

test("in Editing mode the assistant's changes go straight into the doc, and the choice is remembered", async ({ page, request }) => {
  const ws = await newWorkspace(request, "E2E editing mode");
  await page.goto(`/s/${ws.participant_token}`);
  await expect(page.locator(".doc-title")).toHaveText("Untitled");
  const chat = page.getByRole("region", { name: "Chat", exact: true });
  await chat.getByRole("button", { name: "Assistant: Suggesting" }).click();
  await page.getByRole("menuitemradio", { name: /^Editing/ }).click();
  await chat.getByLabel("Message").fill("Please write the worksheet on metaphors and similes");
  await chat.getByRole("button", { name: /send/i }).click();
  await expect(chat).toContainText(/draft worksheet/i, { timeout: 20_000 });
  await expect(page.locator(".canvas-pm h1, .canvas-pm h2").first()).toBeVisible();
  await expect(page.locator(".canvas-pm > .st-proposed, .canvas-pm > [class*='pending-']")).toHaveCount(0);
  await expect(page.locator(".suggestion-card")).toHaveCount(0);
  await expect(page.getByRole("toolbar", { name: "Suggestions" })).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".canvas-pm h1, .canvas-pm h2").first()).toBeVisible();
  await expect(chat.getByRole("button", { name: "Assistant: Editing" })).toBeVisible();
  await expect
    .poll(async () => {
      const files = await exportFiles(request, ws.session_id);
      return files["events.jsonl"]!.includes('"edit_mode":"edit"');
    }, { timeout: 15_000 })
    .toBe(true);
});
