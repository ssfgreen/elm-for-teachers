/**
 * A pupil joins a class with its code on /r/join (issues #209, #245), in a real browser through the fake
 * issuer: the teacher makes a code through the route, the pupil types it, signs in and is
 * "Pupil 1" in the class.
 */
import { expect, test } from "@playwright/test";
import { becomeSomeone } from "./fakePerson";
import { pupilClass } from "./pupilClass";

test("a pupil types the class code, signs in and is Pupil 1 in the class", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { code, className } = await pupilClass(request, "E2E class code");
  await becomeSomeone(page, "pupil");

  await page.goto("/r/join");
  await page.getByLabel("Class code").fill(code.toLowerCase());
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("link", { name: "Continue with Test issuer" }).click();
  await expect(page).toHaveURL(/\/r$/);
  await expect(page.getByRole("heading", { name: `You are Pupil 1 in ${className}` })).toBeVisible();

  // Next time, no code: still in the class.
  await page.reload();
  await expect(page.getByRole("heading", { name: `You are Pupil 1 in ${className}` })).toBeVisible();
  expect(errors).toEqual([]);
});

test("someone new without a code, or with a wrong one, is told what to do", async ({ page }) => {
  await becomeSomeone(page, "pupil");
  // Log in offers the provider with no code: someone new is sent to Sign up.
  await page.goto("/r/login");
  await page.getByRole("link", { name: "Continue with Test issuer" }).click();
  await expect(page).toHaveURL(/\/r\/join\?error=code_needed$/);
  await expect(page.getByRole("alert")).toContainText("type your class code");

  await page.getByLabel("Class code").fill("ZZZZ-ZZZZ");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("link", { name: "Continue with Test issuer" }).click();
  await expect(page).toHaveURL(/\/r\/join\?error=code_unknown$/);
  await expect(page.getByRole("alert")).toContainText("does not work");
});
