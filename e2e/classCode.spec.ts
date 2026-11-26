/**
 * The "Class code" card on a class's page (#212), with the e2e server's PUPILS=on: make a code,
 * Copy it to the clipboard, Renew gives a different one, Close leaves "Make a code". With the
 * workspace's `pupils` switch off there is no code card, reader card or Readings. With interaction
 * logging on, the research data has `class_code_set` and never the code itself.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

type Logged = { kind: string; payload: Record<string, unknown> };

async function exported(request: APIRequestContext, sessionId: string): Promise<{ text: string; events: Logged[] }> {
  const res = await request.get(`/api/admin/sessions/${sessionId}/export.json`, { headers: ADMIN });
  expect(res.ok()).toBe(true);
  const files = (await res.json()) as Record<string, string>;
  const events = files["events.jsonl"]!.trim().split("\n").map((l) => JSON.parse(l) as Logged);
  return { text: JSON.stringify(files), events };
}

async function workspace(request: APIRequestContext, label: string, pupils: boolean) {
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: `${label} ${Date.now()}`, features: { pupils } } });
  return ((await res.json()) as { session: { session_id: string; participant_token: string } }).session;
}

async function demoClass(page: Page, token: string) {
  await page.goto(`/s/${token}`);
  await page.getByRole("region", { name: "Classes" }).getByRole("button", { name: "Set up your classes" }).click();
  await page.getByRole("button", { name: "Add the demo class (P7A)" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "P7A" })).toBeVisible();
}

test("make a code, copy it, renew it, close it; the code never reaches the research data", async ({ page, request, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const ws = await workspace(request, "E2E class code card", true);
  await request.put(`/api/admin/sessions/${ws.session_id}/interactions`, { headers: ADMIN, data: { on: true, hours: null } });
  await demoClass(page, ws.participant_token);

  const card = page.getByRole("region", { name: "Class code" });
  const box = card.getByRole("textbox", { name: "Class code" });
  await expect(box).toHaveCount(0);
  await card.getByRole("button", { name: "Make a code" }).click();
  await expect(box).toHaveValue(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  await expect(card.getByText(/Pupils go to .+\/r\/join and enter this code/)).toBeVisible();
  const first = await box.inputValue();

  // Copy, and select the code in its box.
  await card.getByRole("button", { name: "Copy" }).click();
  await expect(card.getByRole("status")).toHaveText("Copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(first);
  await box.click();
  await box.selectText();

  // Renew asks first, then gives a different code.
  await card.getByRole("button", { name: "Renew" }).click();
  const renew = card.getByRole("group", { name: "Renew the code" });
  await expect(renew).toContainText("old code stops working at once");
  await renew.getByRole("button", { name: "Renew" }).click();
  await expect(box).not.toHaveValue(first);
  const second = await box.inputValue();
  expect(second).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  // Close, confirmed: back to "Make a code".
  await card.getByRole("button", { name: "Close" }).click();
  await card.getByRole("group", { name: "Close the code" }).getByRole("button", { name: "Close" }).click();
  await expect(card.getByRole("button", { name: "Make a code" })).toBeVisible();
  await expect(box).toHaveCount(0);

  // The research data: the three changes, clicks on the card, never either code.
  await expect.poll(async () => (await exported(request, ws.session_id)).events.filter((e) => e.kind === "class_code_set").length, { timeout: 10_000 }).toBe(3);
  await expect.poll(async () => (await exported(request, ws.session_id)).events.some((e) => e.kind === "click" && JSON.stringify(e.payload).includes('"Copy"')), { timeout: 10_000 }).toBe(true);
  const { text } = await exported(request, ws.session_id);
  for (const code of [first, second]) {
    expect(text).not.toContain(code);
    expect(text).not.toContain(code.replace("-", ""));
  }
  expect(errors).toEqual([]);
});

test("with pupils off, the class page has no code card, reader card or Readings", async ({ page, request }) => {
  const ws = await workspace(request, "E2E pupils off", false);
  await demoClass(page, ws.participant_token);
  await expect(page.getByRole("region", { name: "Class details" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Class code" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Pupil reader" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Readings" })).toHaveCount(0);
});
