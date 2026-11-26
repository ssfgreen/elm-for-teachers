/**
 * The "Pupils who joined" card (#220): two pupils join with the class code, the teacher removes
 * Pupil 1 and Pupil 2 stays, after a reload too. With interaction logging on, the research data
 * has one `class_pupil_remove` and never a member id.
 */
import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";
import { becomeSomeone } from "./fakePerson";
import { pupilSignUp } from "./pupilSignUp";
import { pupilClass } from "./pupilClass";

const ADMIN = { Authorization: "Bearer e2e-password" };

type Logged = { kind: string; payload: Record<string, unknown> };

async function exported(request: APIRequestContext, sessionId: string): Promise<{ text: string; events: Logged[] }> {
  const res = await request.get(`/api/admin/sessions/${sessionId}/export.json`, { headers: ADMIN });
  expect(res.ok()).toBe(true);
  const files = (await res.json()) as Record<string, string>;
  const events = files["events.jsonl"]!.trim().split("\n").map((l) => JSON.parse(l) as Logged);
  return { text: JSON.stringify(files), events };
}

/** A new pupil in their own browser joins with the code; they are "Pupil N" in the class. */
async function join(browser: Browser, code: string, className: string, n: number) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await becomeSomeone(page, "pupil");
  await pupilSignUp(page, code);
  await expect(page.getByRole("heading", { name: `You are Pupil ${n} in ${className}` })).toBeVisible();
  await context.close();
}

test("two pupils join; the teacher removes Pupil 1 and Pupil 2 stays; the research data has no member id", async ({ page, request, browser }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const c = await pupilClass(request, "E2E class members");
  await request.put(`/api/admin/sessions/${c.sessionId}/interactions`, { headers: ADMIN, data: { on: true, hours: null } });
  await join(browser, c.code, c.className, 1);
  await join(browser, c.code, c.className, 2);

  const classId = c.classId;
  const ids = ((await (await request.get(`/api/sessions/${c.sessionId}/classes/${classId}/members`, { headers: { Authorization: `Bearer ${c.token}` } })).json()) as { members: { id: string }[] }).members.map((m) => m.id);
  expect(ids).toHaveLength(2);

  const openClass = () => page.getByRole("region", { name: "Classes" }).getByRole("button", { name: c.className }).click();
  await page.goto(`/s/${c.token}`);
  await openClass();
  const card = page.getByRole("region", { name: "Pupils who joined" });
  await expect(card).toContainText("2 pupils have joined");
  await expect(card.getByRole("listitem")).toHaveCount(2);

  await card.getByRole("listitem").filter({ hasText: "Pupil 1" }).getByRole("button", { name: "Remove" }).click();
  await expect(card).toContainText("Renew the code to stop them joining again");
  await card.getByRole("group").getByRole("button", { name: "Remove" }).click();
  await expect(card.getByRole("listitem")).toHaveCount(1);
  await expect(card.getByRole("listitem")).toContainText("Pupil 2");
  await expect(card).toContainText("1 pupil has joined");

  await page.reload();
  await openClass();
  await expect(card.getByRole("listitem")).toHaveCount(1);
  await expect(card.getByRole("listitem")).toContainText("Pupil 2");

  await expect.poll(async () => (await exported(request, c.sessionId)).events.filter((e) => e.kind === "class_pupil_remove").length, { timeout: 10_000 }).toBe(1);
  await expect.poll(async () => (await exported(request, c.sessionId)).events.some((e) => e.kind === "click" && JSON.stringify(e.payload).includes('"Remove"')), { timeout: 10_000 }).toBe(true);
  const { text, events } = await exported(request, c.sessionId);
  expect(events.find((e) => e.kind === "class_pupil_remove")!.payload).toEqual({ class_id: classId });
  for (const id of ids) expect(text).not.toContain(id);
  expect(errors).toEqual([]);
});
