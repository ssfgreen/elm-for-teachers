/**
 * The Word preview in a real browser: it is a dialog outside the panes, so its scrolling is
 * logged as preview_scroll, not as the document's scroll.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

type Logged = { kind: string; doc_id: string | null; payload: Record<string, unknown> };

async function events(request: APIRequestContext, sessionId: string): Promise<Logged[]> {
  const res = await request.get(`/api/admin/sessions/${sessionId}/export.json`, { headers: ADMIN });
  expect(res.ok()).toBe(true);
  const files = (await res.json()) as Record<string, string>;
  return files["events.jsonl"]!.trim().split("\n").map((l) => JSON.parse(l) as Logged);
}

test("scrolling the Word preview is logged with how far the pages can scroll", async ({ page, request }) => {
  // Shorter than an A4 page, so the preview always scrolls.
  await page.setViewportSize({ width: 1200, height: 700 });
  const created = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: `E2E preview ${Date.now()}` } });
  const ws = ((await created.json()) as { session: { session_id: string; participant_token: string } }).session;

  await page.goto(`/s/${ws.participant_token}`);
  await expect(page.locator(".doc-title")).toHaveText("Untitled");
  await page.getByRole("button", { name: "Preview in Word" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(/A4 · \d+ pages?/);

  await page.locator(".word-preview").hover();
  await page.mouse.wheel(0, 400);
  await expect.poll(() => page.locator(".word-preview").evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await dialog.getByRole("button", { name: "Close" }).click();

  await expect.poll(async () => (await events(request, ws.session_id)).filter((e) => e.kind === "preview_scroll").length, { timeout: 10_000 }).toBeGreaterThan(0);
  const logged = await events(request, ws.session_id);
  const docId = logged.find((e) => e.kind === "doc_preview")?.payload.doc_id;
  expect(docId).toBeTruthy();
  const scrolls = logged.filter((e) => e.kind === "preview_scroll").map((e) => e.payload);
  const last = scrolls.at(-1)!;
  expect(last.doc_id).toBe(docId);
  expect(last.position as number).toBeGreaterThan(0);
  expect(last.max as number).toBeGreaterThanOrEqual(last.position as number);
  // The document itself did not move.
  expect(logged.filter((e) => e.kind === "scroll" && e.payload.pane === "canvas")).toEqual([]);
});
