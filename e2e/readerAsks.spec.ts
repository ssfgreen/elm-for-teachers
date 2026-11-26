/**
 * Asking about a passage in the pupil's reader (#236), in a real browser with the mock provider:
 * the teacher sets a reading with both default prompts and one follow-up; a pupil selects a word
 * and asks "Explain", follows up once, closes the answer, asks about a highlight, and is told when
 * their budget is spent. Nothing on /r calls a workspace route or the event log, and the
 * workspace's export holds neither the passage asked about nor a reply.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { becomeSomeone } from "./fakePerson";
import { pupilSignUp } from "./pupilSignUp";
import { pupilClass } from "./pupilClass";

const ADMIN = { Authorization: "Bearer e2e-password" };
const envelope = () => ({ client_ts: new Date().toISOString(), focus_pane: "none", doc_id: null, thread_id: null });
const WORDS = "Rain falls from clouds over the hills.";

async function exported(request: APIRequestContext, sessionId: string): Promise<string> {
  const res = await request.get(`/api/admin/sessions/${sessionId}/export.json`, { headers: ADMIN });
  expect(res.ok()).toBe(true);
  return JSON.stringify(await res.json());
}

const count = (text: string, word: string) => text.split(word).length - 1;

test("a pupil asks about a word, follows up once, asks about a highlight, and is told when their budget is spent", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const logged: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/sessions/") || r.url().includes("/api/events")) logged.push(r.url());
  });

  // The teacher, through the routes: a reading of one paragraph with both default prompts and one follow-up.
  const c = await pupilClass(request, "E2E reader asks");
  const teacher = { Authorization: `Bearer ${c.token}` };
  const base = `/api/sessions/${c.sessionId}`;
  const docId = ((await (await request.get(`${base}/canvas`, { headers: teacher })).json()) as { docs: { id: string }[] }).docs[0]!.id;
  const inserted = await request.post(`${base}/blocks/insert`, { headers: teacher, data: { doc_id: docId, after: "start", type: "paragraph", content: WORDS, envelope: envelope() } });
  expect(inserted.ok()).toBe(true);
  const prompts = ((await (await request.get(`${base}/reader-prompts`, { headers: teacher })).json()) as { prompts: { id: string }[] }).prompts;
  const set = await request.post(`${base}/classes/${c.classId}/readings`, { headers: teacher, data: { doc_id: docId, prompt_ids: prompts.map((p) => p.id), follow_ups_max: 1, envelope: envelope() } });
  expect(set.status()).toBe(201);

  // The pupil joins and opens the reading.
  await becomeSomeone(page, "pupil");
  await pupilSignUp(page, c.code);
  await page.getByRole("region", { name: "Your readings" }).getByRole("link", { name: "Untitled" }).click();
  await expect(page).toHaveURL(/\/r\/readings\//);
  const text = page.getByText(WORDS);
  await expect(text).toBeVisible();
  const before = await exported(request, c.sessionId);
  logged.length = 0;

  // Select the first word and ask "Explain".
  await text.dblclick({ position: { x: 4, y: 8 } });
  await page.getByRole("group", { name: "Ask about this" }).getByRole("button", { name: "Explain" }).click();
  const answer = page.getByRole("region", { name: "Answer" });
  await expect(answer.locator("blockquote")).toHaveText("Rain");
  const replies = answer.locator("ol > li");
  await expect(replies).toHaveCount(1);
  const reply = (await replies.first().locator("p").nth(1).textContent())!.trim();
  expect(reply.length).toBeGreaterThan(0);

  // One follow-up, then no more.
  await answer.getByRole("group", { name: "Follow up" }).getByRole("button", { name: "I don't understand" }).click();
  await expect(replies).toHaveCount(2);
  await expect(answer.getByText("No more follow-ups on this answer.")).toBeVisible();
  await answer.getByRole("button", { name: "Close" }).click();
  await expect(answer).toHaveCount(0);

  // Highlight a word as "Don't understand", pick it, and ask about it.
  await text.dblclick({ position: { x: 4, y: 8 } });
  await page.getByRole("toolbar").getByRole("button", { name: "Don't understand" }).click();
  const mark = page.getByRole("button", { name: /^Don't understand: Rain/ });
  await expect(mark).toBeVisible();
  await mark.click();
  await expect(page.getByRole("button", { name: "Remove" })).toBeVisible();
  await page.getByRole("group", { name: "Ask about this" }).getByRole("button", { name: "Explain" }).click();
  await expect(answer.locator("blockquote")).toHaveText("Rain");
  await expect(replies).toHaveCount(1);

  // Neither the passage nor a reply reached the workspace's export.
  const after = await exported(request, c.sessionId);
  expect(count(after, "Rain")).toBe(count(before, "Rain"));
  expect(after).not.toContain(reply);

  // The pupil's budget at £0, through the route: the next ask says so.
  const zero = await request.post(`${base}/classes/${c.classId}/reader-settings`, { headers: teacher, data: { pupil_budget_gbp: 0, envelope: envelope() } });
  expect(zero.ok()).toBe(true);
  await answer.getByRole("button", { name: "Close" }).click();
  await mark.click();
  await page.getByRole("group", { name: "Ask about this" }).getByRole("button", { name: "Explain" }).click();
  await expect(page.getByRole("alert")).toHaveText("You have used all the help you can ask for in this class. Please ask your teacher.");

  expect(logged).toEqual([]);
  expect(errors).toEqual([]);
});
