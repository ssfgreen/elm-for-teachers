/**
 * "View as pupil" (#215) in a real browser: the teacher's button opens /r in a new tab as the
 * class's test pupil, a reading set through the routes is listed and opens, "Back to teacher"
 * signs out and closes the tab, and the button works again. The test pupil is not among the
 * pupils who joined; with pupils off there is no button; nothing on /r calls a workspace route.
 */
import { expect, test, type Page } from "@playwright/test";
import { pupilClass } from "./pupilClass";

const ADMIN = { Authorization: "Bearer e2e-password" };
const envelope = () => ({ client_ts: new Date().toISOString(), focus_pane: "none", doc_id: null, thread_id: null });

/** Clicks the button and returns the tab it opened, once /r has loaded in it. */
async function viewAsPupil(page: Page, workspaceCalls: string[], errors: string[]): Promise<Page> {
  const opened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "View as pupil", exact: true }).click();
  const tab = await opened;
  tab.on("pageerror", (e) => errors.push(e.message));
  tab.on("request", (r) => {
    if (r.url().includes("/api/sessions/")) workspaceCalls.push(r.url());
  });
  await expect(tab).toHaveURL(/\/r$/);
  return tab;
}

test("View as pupil opens /r as the test pupil; Back signs out and closes; nobody has joined", async ({ page, request }) => {
  const errors: string[] = [];
  const workspaceCalls: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const c = await pupilClass(request, "E2E test pupil");
  const teacher = { Authorization: `Bearer ${c.token}` };

  // A reading set through the routes.
  const docId = ((await (await request.get(`/api/sessions/${c.sessionId}/canvas`, { headers: teacher })).json()) as { docs: { id: string }[] }).docs[0]!.id;
  const inserted = await request.post(`/api/sessions/${c.sessionId}/blocks/insert`, { headers: teacher, data: { doc_id: docId, after: "start", type: "paragraph", content: "Rain falls from clouds.", envelope: envelope() } });
  expect(inserted.ok()).toBe(true);
  const prompts = ((await (await request.get(`/api/sessions/${c.sessionId}/reader-prompts`, { headers: teacher })).json()) as { prompts: { id: string }[] }).prompts;
  const set = await request.post(`/api/sessions/${c.sessionId}/classes/${c.classId}/readings`, { headers: teacher, data: { doc_id: docId, prompt_ids: [prompts[0]!.id], follow_ups_max: null, envelope: envelope() } });
  expect(set.status()).toBe(201);

  await page.goto(`/s/${c.token}`);
  await page.getByRole("region", { name: "Classes" }).getByRole("button", { name: c.className }).click();

  const tab = await viewAsPupil(page, workspaceCalls, errors);
  await expect(tab.getByRole("region", { name: "Test pupil" })).toContainText("Test pupil (you)");
  await expect(tab.getByRole("heading", { name: `You are Test pupil in ${c.className}` })).toBeVisible();
  await tab.getByRole("region", { name: "Your readings" }).getByRole("link", { name: "Untitled" }).click();
  await expect(tab).toHaveURL(/\/r\/readings\//);
  await expect(tab.getByText("Rain falls from clouds.")).toBeVisible();
  await expect(tab.getByRole("region", { name: "Test pupil" })).toBeVisible();
  // The tab cannot reach the teacher's page.
  expect(await tab.evaluate(() => window.opener)).toBeNull();

  const closed = tab.waitForEvent("close");
  await tab.getByRole("button", { name: "Back to teacher" }).click();
  await closed;
  // Signed out: /me no longer answers for this browser.
  expect((await page.request.get("/api/pupil/me")).status()).toBe(401);

  // The button works again, and the same test pupil comes back.
  const again = await viewAsPupil(page, workspaceCalls, errors);
  await expect(again.getByRole("heading", { name: `You are Test pupil in ${c.className}` })).toBeVisible();
  await again.close();

  await expect(page.getByRole("region", { name: "Pupils who joined" })).toContainText("No pupils have joined yet.");
  expect(workspaceCalls).toEqual([]);
  expect(errors).toEqual([]);
});

test("with pupils off there is no View as pupil button", async ({ page, request }) => {
  const c = await pupilClass(request, "E2E test pupil off");
  await request.put(`/api/admin/sessions/${c.sessionId}/features`, { headers: ADMIN, data: { features: { pupils: false } } });
  await page.goto(`/s/${c.token}`);
  await page.getByRole("region", { name: "Classes" }).getByRole("button", { name: c.className }).click();
  await expect(page.getByRole("heading", { level: 1, name: c.className })).toBeVisible();
  await expect(page.getByRole("button", { name: "Archive" })).toBeVisible();
  await expect(page.getByRole("button", { name: "View as pupil", exact: true })).toHaveCount(0);
});
