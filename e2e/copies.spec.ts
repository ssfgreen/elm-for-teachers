/**
 * The copy choice in a real browser (docs/spyglass.md, Part 1): asked to copy a doc whose
 * suggestions still wait, the assistant makes no copy, and the teacher chooses what it is built
 * from under the reply. The mock provider answers "copy" with a copy_of of the open doc.
 */
import { expect, test } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

test("a copy waits on the teacher's choice, then is built from it", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: "E2E copy choice" } });
  const ws = ((await res.json()) as { session: { session_id: string; participant_token: string } }).session;
  await page.goto(`/s/${ws.participant_token}`);

  // A worksheet of suggestions, left waiting.
  // A line of the teacher's first: a blank doc takes the turn straight in, with no suggestions.
  await page.locator(".canvas-pm").click();
  await page.keyboard.type("My notes for the lesson.", { delay: 20 });
  await page.waitForTimeout(800);
  const chat = page.getByRole("region", { name: "Chat", exact: true });
  await chat.getByLabel("Message").fill("Please write the worksheet on metaphors and similes");
  await chat.getByRole("button", { name: /send/i }).click();
  await expect(chat).toContainText(/draft worksheet/i, { timeout: 20_000 });

  // Asked for a copy: none is made, and the choice shows under the reply.
  await chat.getByLabel("Message").fill("Make a copy of this");
  await chat.getByRole("button", { name: /send/i }).click();
  const card = chat.getByRole("list", { name: "Choose what the copy is made from" });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText(/suggestions waiting/);
  for (const name of ["Approve all and use", "Use only approved", "Use all and leave"]) await expect(card.getByRole("button", { name })).toBeVisible();
  // Still there after a reload.
  await page.waitForTimeout(1000);
  await page.reload();
  await expect(card).toBeVisible({ timeout: 20_000 });

  // Use all and leave: the copy has the suggested text, and the original keeps its suggestions.
  await card.getByRole("button", { name: "Use all and leave" }).click();
  await expect(card).toHaveCount(0);
  await expect(page.locator(".doc-title")).toHaveText("Copy", { timeout: 20_000 });
  await expect(page.locator(".canvas-pm")).toContainText(/simile/i);

  // Answered: after a reload the card does not come back.
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(chat).toContainText(/made a copy/i, { timeout: 20_000 });
  await expect(card).toHaveCount(0);

  const files = (await (await request.get(`/api/admin/sessions/${ws.session_id}/export.json`, { headers: ADMIN })).json()) as Record<string, string>;
  const events = files["events.jsonl"]!.trim().split("\n").map((l) => JSON.parse(l) as { kind: string; payload: Record<string, unknown> });
  expect(events.find((e) => e.kind === "copy_choice")?.payload).toMatchObject({ choice: "all_and_leave" });
  expect(errors).toEqual([]);
});
