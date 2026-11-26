/**
 * The pupil's reader (#213) in a real browser: the teacher sets a reading through the routes, a
 * pupil joins with the class code, opens it, highlights a word as "Don't understand", reloads,
 * and removes it. Nothing on /r calls a workspace route (no event logger there).
 */
import { expect, test } from "@playwright/test";
import { becomeSomeone } from "./fakePerson";
import { pupilSignUp } from "./pupilSignUp";

const ADMIN = { Authorization: "Bearer e2e-password" };
const envelope = () => ({ client_ts: new Date().toISOString(), focus_pane: "none", doc_id: null, thread_id: null });

test("a pupil opens a reading, highlights a word as Don't understand, reloads, and removes it", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const workspaceCalls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/sessions/")) workspaceCalls.push(r.url());
  });

  // The teacher, through the routes: pupils on, the demo class, a code, a doc with text set as a reading.
  const made = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: `E2E reader ${Date.now()}` } });
  const { session } = (await made.json()) as { session: { session_id: string; participant_token: string } };
  const sid = session.session_id;
  const teacher = { Authorization: `Bearer ${session.participant_token}` };
  await request.put(`/api/admin/sessions/${sid}/features`, { headers: ADMIN, data: { features: { pupils: true } } });
  const cls = ((await (await request.post(`/api/sessions/${sid}/classes/demo`, { headers: teacher, data: { envelope: envelope() } })).json()) as { class: { id: string } }).class;
  const { code } = (await (await request.post(`/api/sessions/${sid}/classes/${cls.id}/code`, { headers: teacher, data: { action: "make", envelope: envelope() } })).json()) as { code: string };
  const docId = ((await (await request.get(`/api/sessions/${sid}/canvas`, { headers: teacher })).json()) as { docs: { id: string }[] }).docs[0]!.id;
  const inserted = await request.post(`/api/sessions/${sid}/blocks/insert`, { headers: teacher, data: { doc_id: docId, after: "start", type: "paragraph", content: "Rain falls from clouds.", envelope: envelope() } });
  expect(inserted.ok()).toBe(true);
  const prompts = ((await (await request.get(`/api/sessions/${sid}/reader-prompts`, { headers: teacher })).json()) as { prompts: { id: string }[] }).prompts;
  const set = await request.post(`/api/sessions/${sid}/classes/${cls.id}/readings`, { headers: teacher, data: { doc_id: docId, prompt_ids: [prompts[0]!.id], follow_ups_max: null, envelope: envelope() } });
  expect(set.status()).toBe(201);
  workspaceCalls.length = 0;

  // The pupil joins and opens the reading from /r.
  await becomeSomeone(page, "pupil");
  await pupilSignUp(page, code);
  await page.getByRole("region", { name: "Your readings" }).getByRole("link", { name: "Untitled" }).click();
  await expect(page).toHaveURL(/\/r\/readings\//);
  const text = page.getByText("Rain falls from clouds.");
  await expect(text).toBeVisible();
  await expect(page.locator("[contenteditable]")).toHaveCount(0);

  // A double click selects the first word; the pupil labels it.
  await text.dblclick({ position: { x: 4, y: 8 } });
  await page.getByRole("toolbar").getByRole("button", { name: "Don't understand" }).click();
  const mark = page.getByRole("button", { name: /^Don't understand: Rain/ });
  await expect(mark).toBeVisible();

  await page.reload();
  await expect(mark).toBeVisible();

  // Picked from the keyboard, then removed.
  await mark.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(mark).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Rain falls from clouds.")).toBeVisible();
  await expect(mark).toHaveCount(0);

  expect(workspaceCalls).toEqual([]);
  expect(errors).toEqual([]);
});
