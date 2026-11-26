/**
 * Typing into a new doc at a person's pace keeps every word, on screen and on the server, while
 * the first block's save is still coming back. See playwright.config.ts.
 */
import { expect, test } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

test("lines typed straight away in a new doc are all kept", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: "E2E fast typing" } });
  const ws = ((await res.json()) as { session: { session_id: string; participant_token: string } }).session;
  await page.goto(`/s/${ws.participant_token}`);
  await expect(page.locator(".doc-title")).toHaveText("Untitled");
  await page.locator(".canvas-pm").click();

  for (const [i, line] of ["red", "green", "blue"].entries()) {
    if (i) await page.keyboard.press("Enter");
    await page.keyboard.type(line, { delay: 80 });
  }
  const shown = () => page.locator(".canvas-pm > p").allTextContents();
  await expect.poll(shown).toEqual(["red", "green", "blue"]);
  await page.waitForTimeout(1500);
  expect(await shown()).toEqual(["red", "green", "blue"]);

  await expect
    .poll(async () => {
      const files = (await (await request.get(`/api/admin/sessions/${ws.session_id}/export.json`, { headers: ADMIN })).json()) as Record<string, string>;
      const blocks = JSON.parse(files["blocks.json"]!) as Array<{ content: string; status: string; order: number }>;
      return blocks.filter((b) => b.status === "live").sort((a, b) => a.order - b.order).map((b) => b.content);
    }, { timeout: 15_000 })
    .toEqual(["red", "green", "blue"]);
  expect(errors, "uncaught errors in the page").toEqual([]);
});
