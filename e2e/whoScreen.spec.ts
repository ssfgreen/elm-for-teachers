/**
 * The front page's Sign up and Log in, and the who screen behind them (#224): teacher or pupil.
 */
import { expect, test } from "@playwright/test";

test("from /, Sign up, I am a teacher, lands on /start", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Sign up" }).first().click();
  await expect(page).toHaveURL("/signup");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign up");
  await page.getByRole("link", { name: "I am a teacher" }).click();
  await expect(page).toHaveURL("/start");
});

test("from /, Log in, I am a pupil, lands on /r/login", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Log in");
  await page.getByRole("link", { name: "I am a pupil" }).click();
  await expect(page).toHaveURL("/r/login");
});

test("the choices take Tab and Enter, with a focus ring", async ({ page }) => {
  await page.goto("/login");
  const teacher = page.getByRole("link", { name: "I am a teacher" });
  for (let i = 0; i < 6 && !(await teacher.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(teacher).toBeFocused();
  // The ring is a box shadow on top of the card's own: the focused card's differs from the other's.
  const shadow = (name: string) => page.getByRole("link", { name }).evaluate((el) => getComputedStyle(el).boxShadow);
  expect(await shadow("I am a teacher")).not.toBe(await shadow("I am a pupil"));
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "I am a pupil" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/signin");
});

test("at phone width both choices fit, one above the other", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/signup", "/login"]) {
    await page.goto(path);
    const widths = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(widths[0]).toBeLessThanOrEqual(widths[1]);
    const t = (await page.getByRole("link", { name: "I am a teacher" }).boundingBox())!;
    const p = (await page.getByRole("link", { name: "I am a pupil" }).boundingBox())!;
    expect(p.y).toBeGreaterThanOrEqual(t.y + t.height);
    await expect(page.getByRole("link", { name: "I am a pupil" })).toBeInViewport();
  }
});
