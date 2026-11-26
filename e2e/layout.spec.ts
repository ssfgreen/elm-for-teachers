/**
 * The workspace in narrow windows: below 820px the editor sits over the chat, split by a line
 * that can be dragged; below 1000px the sidebar is a drawer opened from the header.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

async function openWorkspace(page: Page, request: APIRequestContext, label: string) {
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label } });
  expect(res.ok()).toBe(true);
  const { session } = (await res.json()) as { session: { participant_token: string } };
  await page.goto(`/s/${session.participant_token}`);
  await expect(page.locator(".doc-title")).toHaveText("Untitled");
}

const box = async (page: Page, selector: string) => (await page.locator(selector).boundingBox())!;

test("phone: the editor over the chat, a line to move between them, the sidebar a drawer", async ({ page, request }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page, request, "E2E phone layout");

  // No sidebar or rail takes room: the document and chat fill the width, the chat a third of the height.
  await expect(page.getByRole("navigation", { name: "Chats" })).toHaveCount(0);
  const doc = await box(page, '[data-pane="canvas"]');
  const chat = await box(page, '[data-pane="chat"]');
  expect(doc.width).toBeGreaterThan(385);
  expect(chat.width).toBeGreaterThan(385);
  expect(doc.y).toBeLessThan(chat.y);
  expect(chat.height / 844).toBeGreaterThan(0.28);
  expect(chat.height / 844).toBeLessThan(0.38);
  // The page itself never scrolls.
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(844);
  await page.screenshot({ path: info.outputPath("phone.png") });

  // Dragging the line up gives the chat more room, and it stays after a reload.
  const line = page.getByRole("separator", { name: "Resize the chat" });
  const l = (await line.boundingBox())!;
  await page.mouse.move(l.x + l.width / 2, l.y);
  await page.mouse.down();
  await page.mouse.move(l.x + l.width / 2, l.y - 200, { steps: 5 });
  await page.mouse.up();
  const taller = await box(page, '[data-pane="chat"]');
  expect(taller.height).toBeGreaterThan(chat.height + 150);
  await page.reload();
  await expect(page.locator(".doc-title")).toHaveText("Untitled");
  expect((await box(page, '[data-pane="chat"]')).height).toBeGreaterThan(chat.height + 150);

  // The sidebar opens over the panes from the document's header, and closes when a chat is picked.
  await page.locator(".doc-head").getByRole("button", { name: "Open sidebar" }).click();
  const drawer = page.getByRole("dialog", { name: "Sidebar" });
  await expect(drawer.getByRole("navigation", { name: "Chats" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("phone-drawer.png") });
  await drawer.getByRole("button", { name: "New chat" }).first().click();
  await expect(drawer).toHaveCount(0);
});

test("phone, with suggestions: the title, every header button and each card's Accept and Reject fit the width", async ({ page, request }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openWorkspace(page, request, "E2E phone suggestions");
  // A line of the teacher's first: a blank doc takes the turn straight in, with no suggestions.
  await page.locator(".canvas-pm").click();
  await page.keyboard.type("My notes for the lesson.", { delay: 20 });
  await page.waitForTimeout(800);
  const chat = page.getByRole("region", { name: "Chat", exact: true });
  await chat.getByLabel("Message").fill("Please write the worksheet on metaphors and similes");
  await chat.getByRole("button", { name: /send/i }).click();
  const suggestions = page.getByRole("toolbar", { name: "Suggestions" });
  await expect(suggestions).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: info.outputPath("phone-suggestions.png") });

  // The closed sidebar leaves one button, on the title's line; the title keeps room to be read.
  const head = page.locator(".doc-head");
  await expect(head.getByRole("button", { name: "New chat" })).toHaveCount(0);
  const opener = await box(page, '.doc-head [aria-label="Open sidebar"]');
  const title = await box(page, ".doc-title");
  expect(title.width).toBeGreaterThan(40);
  expect(await page.locator(".doc-title").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(Math.abs(opener.y + opener.height / 2 - (title.y + title.height / 2))).toBeLessThan(4);
  // Accept all and Reject all go onto a line of their own, under the title.
  expect((await suggestions.boundingBox())!.y).toBeGreaterThan(title.y + title.height);
  for (const b of await head.getByRole("button").all()) {
    const r = (await b.boundingBox())!;
    expect(r.x + r.width).toBeLessThanOrEqual(390);
  }
  // The cards are in the comments drawer, closed to start.
  await head.getByRole("button", { name: "Show comments" }).click();
  await expect(page.locator(".suggestion-card").first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("phone-suggestion-cards.png") });
  const accept = (await page.locator(".suggestion-card .suggestion-accept").first().boundingBox())!;
  const reject = (await page.locator(".suggestion-card .suggestion-reject").first().boundingBox())!;
  expect(accept.x).toBeGreaterThan(0);
  expect(reject.x + reject.width).toBeLessThanOrEqual(390);
});

test("900px: document and chat side by side, the sidebar a drawer from the chat's header", async ({ page, request }, info) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await openWorkspace(page, request, "E2E medium layout");
  await expect(page.getByRole("navigation", { name: "Chats" })).toHaveCount(0);
  const doc = await box(page, '[data-pane="canvas"]');
  const chat = await box(page, '[data-pane="chat"]');
  expect(chat.x).toBeLessThan(doc.x);
  expect(chat.x).toBe(0);
  await page.screenshot({ path: info.outputPath("medium.png") });
  await page.locator(".chat-head").getByRole("button", { name: "Open sidebar" }).click();
  await expect(page.getByRole("dialog", { name: "Sidebar" })).toBeVisible();
  // The panes underneath keep their place.
  expect((await box(page, '[data-pane="canvas"]')).x).toBe(doc.x);
  await page.screenshot({ path: info.outputPath("medium-drawer.png") });
  // Outside the editor (the New project form), the opener floats at the top left.
  await page.getByRole("dialog", { name: "Sidebar" }).getByRole("button", { name: "New project" }).click();
  await expect(page.getByRole("dialog", { name: "Sidebar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open sidebar" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("medium-project.png") });
});

test("1200px: the sidebar sits beside the panes and its open state is remembered", async ({ page, request }, info) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await openWorkspace(page, request, "E2E wide layout");
  await expect(page.getByRole("navigation", { name: "Chats" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Sidebar" })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("wide.png") });
  await page.getByRole("button", { name: "Close sidebar" }).click();
  await expect(page.getByRole("navigation", { name: "Chats" })).toHaveCount(0);
  expect((await box(page, '[data-pane="chat"]')).x).toBe(0);
  await page.screenshot({ path: info.outputPath("wide-closed.png") });
  await page.reload();
  await expect(page.locator(".doc-title")).toHaveText("Untitled");
  await expect(page.getByRole("navigation", { name: "Chats" })).toHaveCount(0);
});
