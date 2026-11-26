/**
 * Writing lines in a real browser: added from the "/" menu, drawn to the right margin (full
 * width on a line of their own, the rest of the line after text), and kept when the page reloads.
 */
import { expect, test, type Page } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

/** How far each writing line's right end is from its block's right edge, in pixels. */
const gaps = (page: Page) =>
  page.locator(".canvas-pm span[data-writing-line]").evaluateAll((els) =>
    els.map((el) => {
      const block = el.parentElement!;
      const right = block.getBoundingClientRect().right - (Number.parseFloat(getComputedStyle(block).paddingRight) || 0);
      const r = el.getBoundingClientRect();
      return { gap: Math.round(right - r.right), width: Math.round(r.width) };
    }),
  );

test("a writing line from the / menu runs to the right margin, and is saved", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: "E2E writing lines" } });
  const ws = ((await res.json()) as { session: { participant_token: string } }).session;
  await page.goto(`/s/${ws.participant_token}`);
  await expect(page.locator(".doc-title")).toHaveText("Untitled");
  await page.locator(".canvas-pm").click();

  const addLine = async () => {
    await page.keyboard.type("/writing");
    await expect(page.getByText("Writing line", { exact: true })).toBeVisible();
    await page.keyboard.press("Enter");
  };
  // After text: the rest of the line.
  await page.keyboard.type("The old door creaked like ");
  await addLine();
  // On a line of its own: the whole width.
  await page.keyboard.press("Enter");
  await addLine();

  await expect(page.locator(".canvas-pm span[data-writing-line]")).toHaveCount(2);
  const [after, own] = await gaps(page);
  expect(after!.gap).toBeLessThanOrEqual(3);
  expect(own!.gap).toBeLessThanOrEqual(3);
  expect(own!.width).toBeGreaterThan(after!.width);

  // Saved as <line/>: still there after a reload.
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.locator(".canvas-pm span[data-writing-line]")).toHaveCount(2);
  expect((await gaps(page)).every((g) => g.gap <= 3)).toBe(true);
  expect(errors).toEqual([]);
});
