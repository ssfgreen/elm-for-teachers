/**
 * A class's Pupil reader card (#186): both values set, still set after a reload; one emptied goes
 * back to config's default, marked "(default)".
 */
import { expect, test, type Page } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

const card = (page: Page) => page.getByRole("region", { name: "Pupil reader" });

async function setField(page: Page, label: string, value: string) {
  const box = card(page).getByLabel(label, { exact: true });
  await box.fill(value);
  const saved = page.waitForResponse((r) => r.url().endsWith("/reader-settings") && r.request().method() === "POST" && r.ok());
  await box.press("Enter");
  await saved;
}

test("set both reader settings, reload: still set; empty one: the default", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: "E2E class reader settings", features: { pupils: true } } });
  const { session } = (await res.json()) as { session: { participant_token: string } };
  await page.goto(`/s/${session.participant_token}`);
  await page.getByRole("region", { name: "Classes" }).getByRole("button", { name: "Set up your classes" }).click();
  await page.getByRole("button", { name: "Add the demo class (P7A)" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "P7A" })).toBeVisible();

  // Config's values to start with.
  await expect(card(page).getByLabel("Follow-ups", { exact: true })).toHaveValue("3");
  await expect(card(page).getByLabel("Pupil budget", { exact: true })).toHaveValue("£0.50");
  // The two numbers and the safety instruction (#195).
  await expect(card(page).getByText("(default)")).toHaveCount(3);

  await setField(page, "Follow-ups", "5");
  await setField(page, "Pupil budget", "75p");
  await expect(card(page).getByText("(default)")).toHaveCount(1);

  await page.reload();
  await page.getByRole("region", { name: "Classes" }).getByRole("button", { name: "P7A" }).click();
  await expect(card(page).getByLabel("Follow-ups", { exact: true })).toHaveValue("5");
  await expect(card(page).getByLabel("Pupil budget", { exact: true })).toHaveValue("£0.75");
  await expect(card(page).getByText("(default)")).toHaveCount(1);

  await setField(page, "Pupil budget", "");
  await expect(card(page).getByLabel("Pupil budget", { exact: true })).toHaveValue("£0.50");
  await expect(card(page).getByText("(default)")).toHaveCount(2);
  await expect(card(page).getByLabel("Follow-ups", { exact: true })).toHaveValue("5");
  expect(errors).toEqual([]);
});
