/**
 * A class's safety instruction for the reader (#195): the class's own version saved on blur, still
 * there after a reload; "Back to the default" puts config's text back; an empty box is refused.
 */
import { expect, test, type Page } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

const card = (page: Page) => page.getByRole("region", { name: "Pupil reader" });
const box = (page: Page) => card(page).getByLabel("Safety instruction", { exact: true });
const saved = (page: Page) => page.waitForResponse((r) => r.url().endsWith("/reader-settings") && r.request().method() === "POST" && r.ok());

test("set a class's safety instruction, reload: still there; back to the default", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: "E2E class safety instruction", features: { pupils: true } } });
  const { session } = (await res.json()) as { session: { participant_token: string } };
  await page.goto(`/s/${session.participant_token}`);
  await page.getByRole("region", { name: "Classes" }).getByRole("button", { name: "Set up your classes" }).click();
  await page.getByRole("button", { name: "Add the demo class (P7A)" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "P7A" })).toBeVisible();

  const reset = card(page).getByRole("button", { name: "Back to the default" });
  const defaultText = await box(page).inputValue();
  expect(defaultText.length).toBeGreaterThan(0);
  await expect(reset).toBeDisabled();

  // Empty is refused, without a save.
  await box(page).fill("");
  await box(page).blur();
  await expect(card(page).getByRole("alert")).toContainText("cannot be empty");
  await expect(box(page)).toHaveValue(defaultText);

  const own = "Keep replies short. Talk only about the reading.";
  await box(page).fill(own);
  const done = saved(page);
  await box(page).blur();
  await done;
  await expect(card(page).getByText("(this class)")).toBeVisible();

  await page.reload();
  await page.getByRole("region", { name: "Classes" }).getByRole("button", { name: "P7A" }).click();
  await expect(box(page)).toHaveValue(own);
  await expect(reset).toBeEnabled();

  const back = saved(page);
  await reset.click();
  await back;
  await expect(box(page)).toHaveValue(defaultText);
  await expect(reset).toBeDisabled();

  await page.reload();
  await page.getByRole("region", { name: "Classes" }).getByRole("button", { name: "P7A" }).click();
  await expect(box(page)).toHaveValue(defaultText);
  expect(errors).toEqual([]);
});
