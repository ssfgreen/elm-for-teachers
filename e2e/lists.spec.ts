/**
 * Lists as a block per item (PLAN.md section 6) in a real browser: typing a list, numbering,
 * ticking, Enter and Backspace, the toolbar, paste, and what the server stores. The mock
 * provider is not used. See playwright.config.ts.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

async function openWorkspace(page: Page, request: APIRequestContext, label: string) {
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label } });
  expect(res.ok()).toBe(true);
  const ws = ((await res.json()) as { session: { session_id: string; participant_token: string } }).session;
  await page.goto(`/s/${ws.participant_token}`);
  await expect(page.locator(".doc-title")).toHaveText("Untitled");
  await page.locator(".canvas-pm").click();
  return ws;
}

async function storedBlocks(request: APIRequestContext, sessionId: string) {
  const res = await request.get(`/api/admin/sessions/${sessionId}/export.json`, { headers: ADMIN });
  expect(res.ok()).toBe(true);
  const files = (await res.json()) as Record<string, string>;
  const blocks = JSON.parse(files["blocks.json"]!) as Array<{ type: string; content: string; status: string; order: number }>;
  return blocks.filter((b) => b.status === "live").sort((a, b) => a.order - b.order).map((b) => [b.type, b.content]);
}

/**
 * Click, then a key that moves the caret, and give the editor a moment after each: ProseMirror
 * reads where the caret is from the browser's selectionchange event, which comes just after.
 * A key sent sooner acts on where the caret was before (no person types that fast).
 */
async function placeCursor(page: Page, click: () => Promise<void>, key: string) {
  await click();
  await page.waitForTimeout(100);
  await page.keyboard.press(key);
  await page.waitForTimeout(100);
}

const items = (page: Page) => page.locator(".canvas-pm > .list-blk");
const shown = async (page: Page) =>
  page.locator(".canvas-pm > *").evaluateAll((els) =>
    els.map((el) => {
      const kind = el.getAttribute("data-list") ?? el.tagName.toLowerCase();
      const n = el.getAttribute("data-n");
      return `${kind}${n ? ` ${n}` : ""}: ${el.textContent ?? ""}`;
    }),
  );

test("typing a list: markers start one, Enter adds items, Enter on an empty item ends it", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const ws = await openWorkspace(page, request, "E2E typed lists");

  await page.keyboard.type("Starter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("two");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("1. first");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second");
  await page.keyboard.press("Enter");
  await page.keyboard.type("third");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("[] pack bag");
  await page.keyboard.press("Enter");
  await page.keyboard.type("bring pen");

  await expect.poll(() => shown(page)).toEqual([
    "p: Starter",
    "bullet: one",
    "bullet: two",
    "numbered 1: first",
    "numbered 2: second",
    "numbered 3: third",
    "check: pack bag",
    "check: bring pen",
  ]);
  // The bullet and the number are drawn, not typed.
  const marker = await items(page).nth(2).evaluate((el) => getComputedStyle(el, "::before").content);
  expect(marker).toBe('"1."');

  // Ticking an item.
  await items(page).nth(5).getByRole("checkbox", { name: "Tick" }).click();
  await expect(items(page).nth(5)).toHaveAttribute("data-checked", "true");

  // The server has a block per item.
  await expect
    .poll(() => storedBlocks(request, ws.session_id), { timeout: 15_000 })
    .toEqual([
      ["paragraph", "Starter"],
      ["bullet_item", "- one"],
      ["bullet_item", "- two"],
      ["numbered_item", "1. first"],
      ["numbered_item", "2. second"],
      ["numbered_item", "3. third"],
      ["checklist_item", "- [x] pack bag"],
      ["checklist_item", "- [ ] bring pen"],
    ]);
  await page.reload();
  await expect.poll(() => shown(page)).toContain("numbered 3: third");
  await expect(items(page).nth(5)).toHaveAttribute("data-checked", "true");
  expect(errors, "uncaught errors in the page").toEqual([]);
});

test("Backspace at the start of an item makes it a paragraph, and the numbers after it count again", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openWorkspace(page, request, "E2E backspace");

  await page.keyboard.type("1. a");
  for (const t of ["b", "c", "d"]) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(t);
  }
  await expect.poll(() => shown(page)).toEqual(["numbered 1: a", "numbered 2: b", "numbered 3: c", "numbered 4: d"]);

  // Inserting an item in the middle renumbers what is shown below it.
  await placeCursor(page, () => items(page).nth(0).click(), "End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("a2");
  await expect.poll(() => shown(page)).toEqual(["numbered 1: a", "numbered 2: a2", "numbered 3: b", "numbered 4: c", "numbered 5: d"]);

  // Backspace at the start of "b" makes it a paragraph; "c" starts a new run.
  await placeCursor(page, () => items(page).nth(2).click(), "Home");
  await page.keyboard.press("Backspace");
  const after = await shown(page);
  expect(after.slice(0, 3)).toEqual(["numbered 1: a", "numbered 2: a2", "p: b"]);
  expect(after.slice(3).map((s) => s.replace(/ \d+:/, ":"))).toEqual(["numbered: c", "numbered: d"]);
  const [c, d] = after.slice(3).map((s) => Number(/ (\d+):/.exec(s)![1]));
  expect(d).toBe(c! + 1);
  expect(errors, "uncaught errors in the page").toEqual([]);
});

test("the toolbar turns selected paragraphs into list items and back", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openWorkspace(page, request, "E2E toolbar lists");

  for (const [i, t] of ["red", "green", "blue"].entries()) {
    if (i) await page.keyboard.press("Enter");
    await page.keyboard.type(t);
  }
  // Mod-A selects the block, then everything.
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+Shift+7");
  await expect.poll(() => shown(page)).toEqual(["numbered 1: red", "numbered 2: green", "numbered 3: blue"]);
  await page.keyboard.press("ControlOrMeta+Shift+8");
  await expect.poll(() => shown(page)).toEqual(["bullet: red", "bullet: green", "bullet: blue"]);
  await page.keyboard.press("ControlOrMeta+Shift+8");
  await expect.poll(() => shown(page)).toEqual(["p: red", "p: green", "p: blue"]);
  expect(errors, "uncaught errors in the page").toEqual([]);
});

test("a pasted list comes in as items", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openWorkspace(page, request, "E2E paste lists");

  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData("text/html", "<ol><li>Read</li><li>Plan<ul><li>notes</li></ul></li><li>Write</li></ol>");
    data.setData("text/plain", "1. Read\n2. Plan\n- notes\n3. Write");
    document.querySelector(".canvas-pm")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  // The nested item comes in flat, between the numbered ones; the run after it keeps its own number.
  await expect.poll(() => shown(page)).toEqual(["numbered 1: Read", "numbered 2: Plan", "bullet: notes", "numbered 3: Write"]);
  expect(errors, "uncaught errors in the page").toEqual([]);
});

test("list markers sit in one column on the first line: a checklist's box beside its text, 10. and 11. whole", async ({ page, request }) => {
  await openWorkspace(page, request, "E2E list markers");
  await page.keyboard.type("[ ] Pack the bag");
  await page.waitForTimeout(100);
  const item = items(page).first();
  const box = (await item.locator("input[type=checkbox]").boundingBox())!;
  const text = (await item.locator("div").first().boundingBox())!;
  // The box is beside the text, on its first line, not on a line of its own above it.
  expect(box.x + box.width).toBeLessThan(text.x);
  expect(Math.abs(box.y + box.height / 2 - (text.y + 12))).toBeLessThan(8);

  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("1. one");
  for (let i = 2; i <= 11; i++) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(`item ${i}`);
  }
  await page.waitForTimeout(200);
  const eleventh = items(page).last();
  await expect(eleventh).toHaveAttribute("data-n", "11");
  // The marker is one line high, so "11." has not wrapped its full stop onto a second line.
  const marker = await eleventh.evaluate((el) => {
    const s = getComputedStyle(el, "::before");
    return { height: parseFloat(s.height), lineHeight: parseFloat(getComputedStyle(el).lineHeight), wrap: s.whiteSpace };
  });
  expect(marker.wrap).toBe("nowrap");
  expect(marker.height).toBeLessThanOrEqual(marker.lineHeight + 1);
});
