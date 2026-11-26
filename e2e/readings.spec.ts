/**
 * Readings (#187) on a class's page: a doc with text is set for the demo class with one prompt;
 * editing and renaming the doc afterwards leaves the reading as it was set; then it is removed.
 */
import { expect, test } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

test("set a doc as a reading for the demo class, edit the doc, the reading is unchanged, remove it", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: "E2E readings", features: { pupils: true } } });
  const ws = ((await res.json()) as { session: { session_id: string; participant_token: string } }).session;
  const auth = { Authorization: `Bearer ${ws.participant_token}` };

  // A doc with text.
  await page.goto(`/s/${ws.participant_token}`);
  await expect(page.locator(".doc-title")).toHaveText("Untitled");
  await page.locator(".canvas-pm").click();
  await page.keyboard.type("Rain falls from clouds.", { delay: 20 });
  await page.waitForTimeout(800);

  // The demo class's page.
  await page.getByRole("region", { name: "Classes" }).getByRole("button", { name: "Set up your classes" }).click();
  await page.getByRole("button", { name: "Add the demo class (P7A)" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "P7A" })).toBeVisible();
  const readings = page.getByRole("region", { name: "Readings" });
  await expect(readings.getByText(/No readings yet/)).toBeVisible();

  // Set the doc with one prompt.
  await readings.getByRole("button", { name: "Set a reading" }).click();
  await readings.getByRole("combobox", { name: /Doc/ }).selectOption({ index: 1 });
  await readings.getByRole("checkbox", { name: "I don't understand" }).uncheck();
  await readings.getByRole("button", { name: "Set reading" }).click();
  const item = readings.getByRole("listitem", { name: "Untitled" });
  await expect(item).toContainText("Prompts: Explain");
  await expect(item).toContainText("Follow-ups: Same as the class");

  const classId = (await (await request.get(`/api/sessions/${ws.session_id}/classes`, { headers: auth })).json()).classes[0].id as string;
  const listed = async () => (await (await request.get(`/api/sessions/${ws.session_id}/classes/${classId}/readings`, { headers: auth })).json()).readings;
  const before = await listed();
  expect(before).toHaveLength(1);

  // Edit the doc: the reading keeps its copy (the server test checks the blocks and their hash).
  await page.goto(`/s/${ws.participant_token}`);
  await page.locator(".canvas-pm").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Then it snows.", { delay: 20 });
  const canvas = async () => JSON.stringify(await (await request.get(`/api/sessions/${ws.session_id}/canvas`, { headers: auth })).json());
  await expect.poll(canvas).toContain("Then it snows.");
  // Rename it too: the reading keeps the name it was set with.
  const envelope = { client_ts: new Date().toISOString(), focus_pane: "none", doc_id: null, thread_id: null };
  const renamed = await request.post(`/api/sessions/${ws.session_id}/blocks/doc_rename`, { headers: auth, data: { command: "doc_rename", doc_id: before[0].doc_id, name: "Weather", envelope } });
  expect(renamed.ok()).toBe(true);
  expect(await listed()).toEqual(before);

  // Remove it, after a confirm.
  await page.getByRole("region", { name: "Classes" }).getByRole("button", { name: "P7A" }).click();
  const again = page.getByRole("region", { name: "Readings" });
  await expect(again.getByRole("listitem", { name: "Untitled" })).toBeVisible();
  await again.getByRole("button", { name: "Remove Untitled" }).click();
  await again.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(again.getByText(/No readings yet/)).toBeVisible();
  expect(await listed()).toEqual([]);
  expect(errors).toEqual([]);
});
