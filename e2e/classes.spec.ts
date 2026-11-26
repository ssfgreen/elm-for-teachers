/**
 * Classes (docs/classes.md): the demo class is added, its pupils show by label, a chat started
 * from its page is for it, and it is copied into next year. The mock provider answers, so this
 * needs no keys.
 */
import { expect, test } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

test("add the demo class, edit a pupil, start a chat for the class, and copy it to next year", async ({ page, request }) => {
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: "E2E classes" } });
  const { session } = (await res.json()) as { session: { participant_token: string } };
  await page.goto(`/s/${session.participant_token}`);
  await expect(page.locator(".doc-title")).toHaveText("Untitled");

  const classes = page.getByRole("region", { name: "Classes" });
  await classes.getByRole("button", { name: "Set up your classes" }).click();
  await page.getByRole("button", { name: "Add the demo class (P7A)" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "P7A" })).toBeVisible();

  // Twenty pupils by made-up label; no names.
  const table = page.getByRole("region", { name: "Pupils", exact: true });
  await expect(table.getByRole("row")).toHaveCount(21);
  // No Needs or Working at column (#243).
  await expect(table.getByLabel(/^Needs for/)).toHaveCount(0);
  await expect(table.getByLabel(/^Working at for/)).toHaveCount(0);
  await expect(table.getByLabel("Label for tidy-puffin", { exact: true })).toHaveValue("tidy-puffin");
  await expect(page.getByText("Callum")).toHaveCount(0);

  // A note typed and saved survives a reload.
  const note = table.getByLabel("Note for brave-kettle", { exact: true });
  await note.fill("EAL. New to the school this term.");
  const saved = page.waitForResponse((r) => r.url().includes("/pupils/") && r.url().endsWith("/update") && r.ok());
  await note.blur();
  await saved;
  await page.reload();
  await page.getByRole("region", { name: "Classes" }).getByRole("button", { name: "P7A" }).click();
  await expect(page.getByRole("region", { name: "Pupils", exact: true }).getByLabel("Note for brave-kettle", { exact: true })).toHaveValue("EAL. New to the school this term.");

  await page.getByLabel("Start a chat for P7A", { exact: true }).fill("A spelling list for tidy-puffin");
  await page.getByRole("button", { name: /send/i }).first().click();
  const chat = page.getByRole("region", { name: "Chat", exact: true });
  await expect(chat.locator(".chat-assistant:not(.chat-draft)")).toHaveCount(1, { timeout: 20_000 });
  // The chat's header names its class; a click goes back to the class's page.
  await page.getByTitle("Open the class P7A").click();
  await expect(page.getByRole("heading", { level: 1, name: "P7A" })).toBeVisible();

  // Next year: P7 moves up to S1, with the pupils.
  await page.getByRole("button", { name: /^Copy to \d{4}-\d{2}$/ }).click();
  await page.getByRole("button", { name: "Copy with its pupils" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "S1A" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Pupils", exact: true }).getByRole("row")).toHaveCount(21);

  // The list shows this year's classes; next year's are a choice away.
  await page.getByRole("region", { name: "Classes" }).getByRole("button", { name: "Classes", exact: true }).click();
  const list = page.getByRole("table");
  await expect(list.getByRole("button", { name: "P7A", exact: true })).toBeVisible();
  await expect(list.getByRole("button", { name: "S1A", exact: true })).toHaveCount(0);
  await page.getByLabel("School year").selectOption({ label: "All years" });
  await expect(list.getByRole("button", { name: "S1A", exact: true })).toBeVisible();
});

test("a class's page: the lists in the main column, a sidebar on the right that goes under them when the page is narrow (#173)", async ({ page, request }) => {
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: "E2E class layout" } });
  const { session } = (await res.json()) as { session: { participant_token: string } };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/s/${session.participant_token}`);
  await page.getByRole("region", { name: "Classes" }).getByRole("button", { name: "Set up your classes" }).click();
  await page.getByRole("button", { name: "Add the demo class (P7A)" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "P7A" })).toBeVisible();

  const pupils = page.getByRole("region", { name: "Pupils", exact: true });
  const chats = page.getByRole("region", { name: "Chats", exact: true });
  const sidebar = page.getByRole("complementary", { name: "About the class" });
  await expect(pupils.getByRole("row")).toHaveCount(21);
  for (const name of ["Class details", "About this class", "Ask or start a chat", "Curriculum", "What is kept"]) {
    await expect(sidebar.getByRole("heading", { level: 2, name })).toBeVisible();
  }
  await expect(sidebar.getByLabel("Start a chat for P7A", { exact: true })).toBeVisible();
  await expect(sidebar.getByLabel("Stage")).toBeVisible();

  // Wide: the sidebar is to the right of the lists, its top level with the chats, the pupils under them,
  // and the chat box on the first screen.
  let p = (await pupils.boundingBox())!;
  let s = (await sidebar.boundingBox())!;
  const c = (await chats.boundingBox())!;
  expect(s.x).toBeGreaterThanOrEqual(p.x + p.width);
  expect(Math.abs(s.y - c.y)).toBeLessThan(40);
  expect(p.y).toBeGreaterThan(c.y);
  await expect(sidebar.getByLabel("Start a chat for P7A", { exact: true })).toBeInViewport();

  // Beside the sidebar, the pupil table never gets narrower than 540px.
  for (const width of [1440, 1280, 1100, 1000, 800]) {
    await page.setViewportSize({ width, height: 900 });
    p = (await pupils.boundingBox())!;
    s = (await sidebar.boundingBox())!;
    if (s.x >= p.x + p.width) {
      expect(p.width, `pupil table at a ${width}px window`).toBeGreaterThanOrEqual(540);
    } else {
      // Under the lists, at their width.
      expect(s.y, `sidebar under the lists at a ${width}px window`).toBeGreaterThan(p.y + p.height);
      expect(s.width).toBeGreaterThan(p.width - 40);
    }
  }
  // At 1000px, with the workspace's sidebar beside the page, it is stacked.
  await page.setViewportSize({ width: 1000, height: 900 });
  p = (await pupils.boundingBox())!;
  s = (await sidebar.boundingBox())!;
  expect(s.y).toBeGreaterThan(p.y + p.height);

  // Narrow: nothing runs off the side of the page.
  await page.setViewportSize({ width: 800, height: 900 });
  const widths = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(widths[0]).toBeLessThanOrEqual(widths[1]);
});
