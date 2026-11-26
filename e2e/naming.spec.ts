/**
 * An Untitled chat is named on its own once it has had three prompts: the name shows in the
 * sidebar with no click on the wand. The mock provider answers, so this needs no keys.
 */
import { expect, test } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

test("an Untitled chat is named after its first three prompts", async ({ page, request }) => {
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: "E2E naming" } });
  const { session } = (await res.json()) as { session: { participant_token: string } };
  await page.goto(`/s/${session.participant_token}`);
  await expect(page.locator(".doc-title")).toHaveText("Untitled");

  const chat = page.getByRole("region", { name: "Chat", exact: true });
  const replies = chat.locator(".chat-assistant:not(.chat-draft)");
  // The chat's own row (expanded, with its documents under it), not its doc's, the menu's or the
  // section headings' (which fold their lists).
  const chatRow = page.getByRole("region", { name: "Chats list" }).getByRole("list").first().getByRole("button", { expanded: true });
  const prompts = ["What is a simile?", "What is a metaphor?", "Explain the difference"];
  for (const [i, text] of prompts.entries()) {
    await chat.getByLabel("Message").fill(text);
    await chat.getByRole("button", { name: /send/i }).click();
    await expect(replies).toHaveCount(i + 1, { timeout: 20_000 });
    // Still Untitled after the first and second prompts.
    if (i < 2) await expect(chatRow).toHaveText("Untitled");
  }
  await expect(chatRow).not.toHaveText("Untitled", { timeout: 10_000 });
  await expect(chatRow).not.toHaveText("");
});
