/**
 * Interaction logging in a real browser: turned on from /admin, the workspace logs the
 * pointer, clicks, the layout, menus and the page state; turned off, it stops. Also checks
 * the note under the chat box.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

type Logged = { kind: string; payload: Record<string, unknown> };

async function events(request: APIRequestContext, sessionId: string): Promise<Logged[]> {
  const res = await request.get(`/api/admin/sessions/${sessionId}/export.json`, { headers: ADMIN });
  expect(res.ok()).toBe(true);
  const files = (await res.json()) as Record<string, string>;
  return files["events.jsonl"]!.trim().split("\n").map((l) => JSON.parse(l) as Logged);
}

test("interaction logging, switched on in admin, records pointer, clicks, layout and menus", async ({ page, request }) => {
  const label = `E2E interactions ${Date.now()}`;
  const created = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label } });
  const ws = ((await created.json()) as { session: { session_id: string; participant_token: string } }).session;

  // Off by default; turned on from the admin page.
  await page.goto("/admin");
  await page.getByLabel("Password").fill("e2e-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  const row = page.getByRole("row").filter({ hasText: label });
  await expect(row).toContainText("Off");
  await row.getByLabel(`Interaction logging for ${label}`).selectOption({ label: "On for 2 hours" });
  await expect(row).toContainText(/On until/);

  await page.goto(`/s/${ws.participant_token}`);
  await expect(page.locator(".doc-title")).toHaveText("Untitled");
  const chat = page.getByRole("region", { name: "Chat", exact: true });
  await expect(chat.getByText("AI makes mistakes. Don’t enter personal data.")).toBeVisible();

  // Move across the document, open and close the Download menu, click into the chat box.
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(300 + i * 20, 300 + i * 5);
    await page.waitForTimeout(120);
  }
  await page.getByRole("button", { name: "Download" }).click();
  await expect(page.getByRole("menu", { name: "Download" })).toBeVisible();
  await page.getByRole("button", { name: "Download" }).click();
  await chat.getByLabel("Message").click();

  await expect.poll(async () => {
    const kinds = new Set((await events(request, ws.session_id)).map((e) => e.kind));
    return ["interaction_logging_set", "pointer", "click", "viewport", "ui_state", "page_state"].filter((k) => !kinds.has(k));
  }, { timeout: 10_000 }).toEqual([]);

  const logged = await events(request, ws.session_id);
  const clicks = logged.filter((e) => e.kind === "click").map((e) => e.payload);
  expect(clicks).toEqual(expect.arrayContaining([
    expect.objectContaining({ control: { role: "button", label: "Download" } }),
    expect.objectContaining({ pane: "chat", control: { role: "textbox", label: "Message" } }),
  ]));
  expect(logged.filter((e) => e.kind === "ui_state").map((e) => e.payload)).toEqual(expect.arrayContaining([
    { role: "menu", label: "Download", open: true },
    { role: "menu", label: "Download", open: false },
  ]));
  const viewport = logged.find((e) => e.kind === "viewport")!.payload as { regions: Record<string, unknown> };
  expect(Object.keys(viewport.regions)).toEqual(expect.arrayContaining(["canvas", "chat"]));
  const samples = logged.filter((e) => e.kind === "pointer").flatMap((e) => (e.payload as { samples: unknown[] }).samples);
  expect(samples.length).toBeGreaterThanOrEqual(5);

  // Turned off: nothing more is kept, and the page stops sending.
  await request.put(`/api/admin/sessions/${ws.session_id}/interactions`, { headers: ADMIN, data: { on: false } });
  const before = (await events(request, ws.session_id)).filter((e) => e.kind === "click").length;
  await page.getByRole("button", { name: "Download" }).click();
  await page.getByRole("button", { name: "Download" }).click();
  await page.waitForTimeout(1500);
  expect((await events(request, ws.session_id)).filter((e) => e.kind === "click").length).toBe(before);
});
