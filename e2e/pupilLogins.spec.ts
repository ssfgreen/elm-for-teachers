/**
 * The "Pupil logins" card (#232), with the e2e server's PUPILS=on: Make 3 shows three usernames and
 * passwords once; Print slips (print stubbed) puts all three in the slips; Done twice hides the
 * passwords, and a reload does not bring them back; the list has 3 "Not used yet", and deleting
 * one (two clicks) leaves 2. With the workspace's `pupils` off and no logins there is no card.
 * With interaction logging on, the research data has `pupil_logins_made` once with the class and
 * the count, and never a username or password.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { pupilClass } from "./pupilClass";

const ADMIN = { Authorization: "Bearer e2e-password" };
const envelope = () => ({ client_ts: new Date().toISOString(), focus_pane: "none", doc_id: null, thread_id: null });

type Logged = { kind: string; payload: Record<string, unknown> };

async function exported(request: APIRequestContext, sessionId: string): Promise<{ text: string; events: Logged[] }> {
  const res = await request.get(`/api/admin/sessions/${sessionId}/export.json`, { headers: ADMIN });
  expect(res.ok()).toBe(true);
  const files = (await res.json()) as Record<string, string>;
  const events = files["events.jsonl"]!.trim().split("\n").map((l) => JSON.parse(l) as Logged);
  return { text: JSON.stringify(files), events };
}

test("make 3, print the slips, Done hides the passwords for good, delete one; the research data has no username or password", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Every frame's print, the slips' own included, only counts on the top page.
  await page.addInitScript(() => {
    const top = window.top as unknown as { __printed?: number };
    window.print = () => {
      top.__printed = (top.__printed ?? 0) + 1;
    };
  });
  const c = await pupilClass(request, "E2E pupil logins");
  await request.put(`/api/admin/sessions/${c.sessionId}/interactions`, { headers: ADMIN, data: { on: true, hours: null } });

  const openClass = () => page.getByRole("region", { name: "Classes" }).getByRole("button", { name: c.className }).click();
  await page.goto(`/s/${c.token}`);
  await openClass();
  const card = page.getByRole("region", { name: "Pupil logins" });
  await expect(card).toContainText("No logins yet.");

  await card.getByRole("spinbutton", { name: "How many" }).fill("3");
  await card.getByRole("button", { name: "Make 3 logins" }).click();
  const panel = card.getByRole("group", { name: "New logins" });
  await expect(panel.getByRole("textbox", { name: "Username" })).toHaveCount(3);
  await expect(panel).toContainText("These passwords are shown only now.");
  const usernames = await panel.getByRole("textbox", { name: "Username" }).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  const passwords = await panel.getByRole("textbox", { name: "Password" }).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(new Set([...usernames, ...passwords]).size).toBe(6);
  for (const s of [...usernames, ...passwords]) expect(s.length).toBeGreaterThan(3);

  await panel.getByRole("button", { name: "Print slips" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed?: number }).__printed ?? 0)).toBe(1);
  const slips = page.frameLocator('iframe[title="Login slips"]');
  await expect(slips.locator(".slip")).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await expect(slips.locator(".slip").nth(i)).toContainText(c.className);
    await expect(slips.locator(".slip").nth(i)).toContainText(usernames[i]!);
    await expect(slips.locator(".slip").nth(i)).toContainText(passwords[i]!);
  }

  // Click into a username and a password, and select each: the log reads neither.
  await panel.getByRole("textbox", { name: "Username" }).first().click();
  await panel.getByRole("textbox", { name: "Username" }).first().selectText();
  await panel.getByRole("textbox", { name: "Password" }).first().click();
  await panel.getByRole("textbox", { name: "Password" }).first().selectText();

  await panel.getByRole("button", { name: "Done" }).click();
  const hide = card.getByRole("group", { name: "Hide the passwords" });
  await expect(hide).toContainText("Hide the passwords? They cannot be shown again.");
  await hide.getByRole("button", { name: "Done" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator('iframe[title="Login slips"]')).toHaveCount(0);
  for (const p of passwords) expect(await page.content()).not.toContain(p);

  await page.reload();
  await openClass();
  const list = card.getByRole("list", { name: "Logins" });
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(list.getByText("Not used yet")).toHaveCount(3);
  await expect(card.getByRole("group", { name: "New logins" })).toHaveCount(0);
  for (const p of passwords) expect(await page.content()).not.toContain(p);

  await list.getByRole("listitem").first().getByRole("button", { name: "Delete" }).click();
  const ask = card.getByRole("group", { name: "Delete the login" });
  await expect(ask).toContainText("Delete this login? Its slip will stop working.");
  await ask.getByRole("button", { name: "Delete" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(2);
  const left = await list.getByRole("textbox", { name: "Username" }).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(left).toEqual(usernames.slice(1));

  await expect.poll(async () => (await exported(request, c.sessionId)).events.filter((e) => e.kind === "pupil_logins_made").length, { timeout: 10_000 }).toBe(1);
  await expect.poll(async () => (await exported(request, c.sessionId)).events.some((e) => e.kind === "click" && JSON.stringify(e.payload).includes('"Print slips"')), { timeout: 10_000 }).toBe(true);
  await expect.poll(async () => (await exported(request, c.sessionId)).events.some((e) => e.kind === "click" && JSON.stringify(e.payload).includes('"Password"')), { timeout: 10_000 }).toBe(true);
  const { text, events } = await exported(request, c.sessionId);
  expect(events.find((e) => e.kind === "pupil_logins_made")!.payload).toEqual({ class_id: c.classId, count: 3 });
  for (const s of [...usernames, ...passwords]) expect(text).not.toContain(s);
  expect(errors).toEqual([]);
});

test("with the workspace's pupils off and no logins, the class page has no Pupil logins card", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const made = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: `E2E logins off ${Date.now()}`, features: { pupils: false } } });
  const { session } = (await made.json()) as { session: { session_id: string; participant_token: string } };
  const teacher = { Authorization: `Bearer ${session.participant_token}` };
  const cls = (await (await request.post(`/api/sessions/${session.session_id}/classes/demo`, { headers: teacher, data: { envelope: envelope() } })).json()) as { class: { name: string } };

  await page.goto(`/s/${session.participant_token}`);
  await page.getByRole("region", { name: "Classes" }).getByRole("button", { name: cls.class.name }).click();
  await expect(page.getByRole("region", { name: "Class details" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Pupil logins" })).toHaveCount(0);
  expect(errors).toEqual([]);
});
