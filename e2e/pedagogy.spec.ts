/**
 * The pedagogy library and a class's curriculum (library/pedagogy-sample/HANDOFF.md, docs/classes.md
 * C.4), against a real library server: the demo class picks an experience and outcome, a pupil
 * gets a library adaptation with their own settings, a class chat's reply carries an "i" that
 * shows its source, and the Pedagogy screen browses the draft library. The mock provider answers.
 */
import { expect, test } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

test("curriculum, a pupil's adaptation, a cited reply and the Pedagogy screen", async ({ page, request }) => {
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: "E2E pedagogy" } });
  const { session } = (await res.json()) as { session: { participant_token: string } };
  await page.goto(`/s/${session.participant_token}`);
  await page.getByRole("region", { name: "Classes" }).getByRole("button", { name: "Set up your classes" }).click();
  await page.getByRole("button", { name: "Add the demo class (P7A)" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "P7A" })).toBeVisible();

  // Curriculum: an outcome found at the class's level (Second, from its stage) and added as now.
  const card = page.getByRole("region", { name: "Curriculum" }).filter({ has: page.getByRole("heading", { name: "Curriculum" }) });
  await card.getByRole("button", { name: "Add from the curriculum" }).click();
  await card.getByLabel("Curriculum area").selectOption("Literacy and English");
  await card.getByLabel("Organiser").selectOption("Reading");
  await card.getByLabel("Search the curriculum").fill("purpose main ideas");
  // The structured curriculum: the outcome under its organiser, with its benchmarks on asking.
  await card.getByRole("button", { name: "Benchmarks for LIT 2-16a" }).first().click();
  await expect(card.getByRole("list", { name: "Benchmarks for LIT 2-16a" }).first()).toContainText("main ideas");
  await card.getByRole("button", { name: "Add LIT 2-16a" }).click();
  await expect(card.getByRole("list", { name: "Now" })).toContainText("LIT 2-16a");
  // The sidebar shows what the class is on now.
  await expect(page.getByRole("navigation", { name: "Chats" }).getByRole("region", { name: "Curriculum" })).toContainText("LIT 2-16a");

  // A library adaptation for tidy-puffin, suggested from their note, with their own settings.
  const table = page.getByRole("region", { name: "Pupils", exact: true });
  await table.getByRole("button", { name: "Add an adaptation for tidy-puffin" }).click();
  const picker = page.getByRole("dialog", { name: "Adaptations for tidy-puffin" });
  await expect(picker).toContainText("a hint for where to look, not a rule");
  await picker.getByRole("button", { name: "Choose Individual letter spacing, font size and background preferences for tidy-puffin" }).click();
  const own = table.getByLabel("tidy-puffin's own settings for Individual letter spacing, font size and background preferences");
  await own.fill("amber overlay, Comic Sans 14pt");
  const saved = page.waitForResponse((r) => r.url().includes("/adaptations/") && r.url().endsWith("/update") && r.ok());
  await own.press("Enter");
  await saved;

  // A chat for the class: the reply cites the library, and the "i" shows the claim and its source.
  await page.getByLabel("Start a chat for P7A", { exact: true }).fill("A spelling list for tidy-puffin");
  await page.getByRole("button", { name: /send/i }).first().click();
  const chat = page.getByRole("region", { name: "Chat", exact: true });
  const reply = chat.locator(".chat-assistant:not(.chat-draft)");
  await expect(reply).toHaveCount(1, { timeout: 20_000 });
  const marker = reply.getByRole("button", { name: /Source for this/ });
  await expect(marker).toHaveCount(1);
  await marker.hover();
  await expect(page.getByRole("tooltip")).toContainText("not yet reviewed by educators");
  await expect(page.getByRole("tooltip").getByRole("link")).toHaveCount(1);
  await expect(reply).not.toContainText("[[clm-");

  // A pupil the reply names shows their row of the class's table; a curriculum code shows the
  // outcome from the app's own curriculum, and opens it in the Curriculum screen.
  await page.mouse.move(0, 0);
  await reply.getByRole("button", { name: "quiet-comet: their row in P7A" }).hover();
  await expect(page.getByRole("tooltip")).toContainText("Extensions helpful for engagement.");
  await expect(page.getByRole("tooltip")).not.toContainText("High achiever");
  await page.mouse.move(0, 0);
  const code = reply.getByRole("button", { name: "LIT 2-16a in the curriculum" });
  await code.hover();
  await expect(page.getByRole("tooltip")).toContainText("purpose and main ideas");
  await expect(page.getByRole("tooltip")).toContainText("Now for P7A");
  await page.mouse.move(0, 0);
  await reply.getByRole("button", { name: "quiet-comet: their row in P7A" }).hover();
  await page.mouse.move(0, 0);
  await code.click();
  await expect(page.getByRole("heading", { level: 1, name: "Curriculum" })).toBeVisible();
  await expect(page.getByRole("article", { name: "LIT 2-16a" })).toBeVisible();

  // The Pedagogy screen: a draft, browsable by type, each entry with its claims.
  await page.getByRole("navigation", { name: "Chats" }).getByRole("button", { name: "Pedagogy", exact: true }).click();
  await expect(page.getByRole("note")).toContainText("no teacher or specialist has reviewed");
  await page.getByRole("radio", { name: /^Cautions/ }).click();
  await page.getByRole("list", { name: "Entries" }).getByRole("button", { name: /Teaching the Holocaust/ }).click();
  const entry = page.getByRole("article", { name: /Teaching the Holocaust/ });
  await expect(entry.getByRole("region", { name: "Claims" })).toContainText("IHRA");

  // From the sidebar's curriculum to the outcome in the Curriculum screen, then its Ideas: the pedagogy aligned to it.
  await page.getByRole("navigation", { name: "Chats" }).getByRole("region", { name: "Curriculum" }).getByRole("button", { name: /LIT 2-16a/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Curriculum" })).toBeVisible();
  await page.getByRole("region", { name: "Outcomes" }).getByRole("button", { name: "Ideas for LIT 2-16a" }).click();
  await expect(page.getByText("Teaching ideas for LIT 2-16a.")).toBeVisible();
  const aligned = page.getByRole("list", { name: "Entries" });
  await expect(aligned.getByRole("button", { name: /Reciprocal reading/ })).toBeVisible();
  await expect(aligned.getByRole("button", { name: /Getting it right for every child/ })).toHaveCount(0);
});
