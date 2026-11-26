/**
 * A study workspace (docs/classes.md, "Study workspaces"): made on /admin with its starting state,
 * it opens on the demo chat for P7A, whose replies cite the pedagogy library and whose last turn
 * Spyglass has flagged. Nothing here calls a model.
 */
import { expect, test } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

test("a study workspace starts with the demo class and a demo chat that shows its features", async ({ page, request }) => {
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: "E2E study", study: true } });
  const { session } = (await res.json()) as { session: { participant_token: string } };
  await page.goto(`/s/${session.participant_token}`);

  // The newest chat is the demo, for P7A, with its two documents.
  const chat = page.getByRole("region", { name: "Chat", exact: true });
  const replies = chat.locator(".chat-assistant:not(.chat-draft)");
  await expect(replies).toHaveCount(3);
  await expect(page.getByTitle("Open the class P7A")).toBeVisible();
  await expect(chat).toContainText("Make a version for tidy-puffin.");
  // Citations as "i", with their source on hover.
  await expect(replies.first().getByRole("button", { name: /Source for this/ })).toHaveCount(3);
  await replies.first().getByRole("button", { name: /Source for this/ }).first().hover();
  await expect(page.getByRole("tooltip")).toContainText("not yet reviewed by educators");
  // Spyglass's flag on the version for tidy-puffin.
  await expect(replies.nth(2).getByRole("complementary", { name: "Spyglass" })).toContainText("Question 3 reworded");
  const sidebar = page.getByRole("navigation", { name: "Chats" });
  await expect(sidebar.getByRole("button", { name: /Volcanoes: main ideas \(tidy-puffin\)/ }).first()).toBeVisible();
  await expect(sidebar.getByRole("region", { name: "Curriculum" })).toContainText("LIT 2-16a");

  // The class page has the adaptations chosen for its pupils.
  await page.getByTitle("Open the class P7A").click();
  await expect(page.getByRole("region", { name: "Pupils", exact: true }).getByLabel("tidy-puffin's own settings for Individual letter spacing, font size and background preferences")).toHaveValue(/Comic Sans 14pt/);
});
