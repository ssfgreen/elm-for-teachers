/**
 * The front page's Sign up and Log in, and the teacher-only who screen behind them.
 */
import { expect, test } from "@playwright/test";

test("from /, Sign up, I am a teacher, lands on /start", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Sign up" }).first().click();
  await expect(page).toHaveURL("/signup");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign up");
  await expect(page.getByRole("link", { name: "I am a pupil" })).toHaveCount(0);
  await page.getByRole("link", { name: "I am a teacher" }).click();
  await expect(page).toHaveURL("/start");
});

test("from /, Log in, I am a teacher, lands on /signin", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Log in");
  await expect(page.getByRole("link", { name: "I am a pupil" })).toHaveCount(0);
  await page.getByRole("link", { name: "I am a teacher" }).click();
  await expect(page).toHaveURL("/signin");
});

test("the teacher choice takes Tab and Enter", async ({ page }) => {
  await page.goto("/login");
  const teacher = page.getByRole("link", { name: "I am a teacher" });
  for (let i = 0; i < 6 && !(await teacher.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(teacher).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/signin");
});

test("at phone width the choice fits without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/signup", "/login"]) {
    await page.goto(path);
    const widths = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(widths[0]).toBeLessThanOrEqual(widths[1]);
    await expect(page.getByRole("link", { name: "I am a teacher" })).toBeInViewport();
  }
});
