/**
 * A table's header row colour in a real browser: picked from the toolbar or the selection
 * bubble, drawn as a light fill, stored with the table and kept after a reload.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

async function storedTables(request: APIRequestContext, sessionId: string) {
  const res = await request.get(`/api/admin/sessions/${sessionId}/export.json`, { headers: ADMIN });
  expect(res.ok()).toBe(true);
  const files = (await res.json()) as Record<string, string>;
  const blocks = JSON.parse(files["blocks.json"]!) as Array<{ type: string; content: string; status: string }>;
  return blocks.filter((b) => b.status === "live" && b.type === "table").map((b) => b.content);
}

test("a table's header row colour, from the toolbar and the bubble, is kept after a reload", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: "E2E table header colour" } });
  const ws = ((await res.json()) as { session: { session_id: string; participant_token: string } }).session;
  await page.goto(`/s/${ws.participant_token}`);
  await expect(page.locator(".doc-title")).toHaveText("Untitled");
  await page.locator(".canvas-pm").click();

  const toolbar = page.getByRole("toolbar", { name: "Formatting" });
  // Only offered in a table.
  await expect(toolbar.getByRole("button", { name: /^Header row colour/ })).toHaveCount(0);
  await toolbar.getByRole("button", { name: "Table" }).click();
  await page.keyboard.type("Word");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Type");

  const th = page.locator(".canvas-pm th").first();
  const grey = await th.evaluate((el) => getComputedStyle(el).backgroundColor);
  await toolbar.getByRole("button", { name: "Header row colour" }).click();
  await page.getByRole("menu", { name: "Header row colour" }).getByRole("menuitemradio", { name: "Blue" }).click();
  await expect(page.locator('.canvas-pm .tableWrapper[data-header-color="blue"]')).toHaveCount(1);
  const blue = await th.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(blue).not.toBe(grey);
  await expect.poll(() => storedTables(request, ws.session_id)).toEqual(["| Word | Type |\n| --- | --- |\n|  |  |\n<!-- header: blue -->"]);

  // The bubble, over text selected in a cell.
  await th.getByText("Word").click();
  await page.waitForTimeout(100);
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  const bubble = page.locator(".bubble-menu");
  await bubble.getByRole("button", { name: "Header row colour: Blue" }).click();
  await bubble.getByRole("menu", { name: "Header row colour" }).getByRole("menuitemradio", { name: "Green" }).click();
  await expect.poll(() => storedTables(request, ws.session_id)).toEqual(["| Word | Type |\n| --- | --- |\n|  |  |\n<!-- header: green -->"]);

  await page.reload();
  await expect(page.locator('.canvas-pm .tableWrapper[data-header-color="green"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});
