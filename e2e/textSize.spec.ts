/**
 * Text size in a real browser: set on selected text from the bubble, drawn at its size in points,
 * stored in the block's content and kept after a reload.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

async function storedParagraphs(request: APIRequestContext, sessionId: string) {
  const res = await request.get(`/api/admin/sessions/${sessionId}/export.json`, { headers: ADMIN });
  expect(res.ok()).toBe(true);
  const files = (await res.json()) as Record<string, string>;
  const blocks = JSON.parse(files["blocks.json"]!) as Array<{ type: string; content: string; status: string }>;
  return blocks.filter((b) => b.status === "live" && b.type === "paragraph").map((b) => b.content);
}

test("a size set on selected text from the bubble is drawn, stored and kept after a reload", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: "E2E text size" } });
  const ws = ((await res.json()) as { session: { session_id: string; participant_token: string } }).session;
  await page.goto(`/s/${ws.participant_token}`);
  await expect(page.locator(".doc-title")).toHaveText("Untitled");
  await page.locator(".canvas-pm").click();
  await page.keyboard.type("Big news");
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");

  const bubble = page.locator(".bubble-menu");
  await bubble.getByRole("button", { name: "Text size: Normal" }).click();
  await bubble.getByRole("menu", { name: "Text size" }).getByRole("menuitemradio", { name: "Huge" }).click();
  const big = page.locator('.canvas-pm span[data-size="huge"]');
  await expect(big).toHaveText("Big");
  // 24pt is 32px.
  expect(await big.evaluate((el) => getComputedStyle(el).fontSize)).toBe("32px");
  await expect.poll(() => storedParagraphs(request, ws.session_id)).toEqual(['<span data-size="huge">Big</span> news']);

  await page.reload();
  await expect(page.locator('.canvas-pm span[data-size="huge"]')).toHaveText("Big");
  expect(errors).toEqual([]);
});
