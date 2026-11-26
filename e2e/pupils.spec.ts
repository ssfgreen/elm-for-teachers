/**
 * Pupil sign-in (issue #179) in a real browser, through the fake issuer (playwright.config.ts):
 * the front page's Sign up, signing up on /r/join with a class code (#209, #245), the signed-in
 * page, signing out, and the teachers' door shut to someone known as a pupil.
 */
import { expect, test } from "@playwright/test";
import { becomeSomeone } from "./fakePerson";
import { pupilClass } from "./pupilClass";

test("a pupil finds the pupil page from the landing page, signs in and signs out", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Someone new signs in only with a class code (#209).
  const { code, className } = await pupilClass(request);
  await becomeSomeone(page, "pupil");

  await page.goto("/");
  // Sign up, then I am a pupil (#224), then the class code on /r/join (#245).
  await page.getByRole("link", { name: "Sign up" }).first().click();
  await page.getByRole("link", { name: "I am a pupil" }).click();
  await expect(page).toHaveURL(/\/r\/join$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign up");

  // The fake issuer approves at once and the server lands back on /r.
  await page.getByLabel("Class code").fill(code);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("link", { name: "Continue with Test issuer" }).click();
  await expect(page).toHaveURL(/\/r$/);
  const signedIn = page.getByRole("heading", { name: `You are Pupil 1 in ${className}` });
  await expect(signedIn).toBeVisible();

  // A pupil's sign-in is not a teacher's: no workspace.
  expect((await page.request.get("/api/account/workspace")).status()).toBe(401);

  // Reload: still signed in. Then sign out.
  await page.reload();
  await expect(signedIn).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/r\/login\?signed_out=1$/);
  await expect(page.getByRole("status")).toHaveText("You have signed out.");
  expect((await page.request.get("/api/pupil/me")).status()).toBe(401);
  expect(errors).toEqual([]);
});

test("someone known as a pupil is turned away at the teachers' sign-in", async ({ page, request }) => {
  const { code, className } = await pupilClass(request);
  await becomeSomeone(page, "pupil");
  await page.goto(`/api/pupil/auth/test/start?code=${code}`);
  await expect(page.getByRole("heading", { name: `You are Pupil 1 in ${className}` })).toBeVisible();

  await page.goto("/api/auth/test/start");
  await expect(page).toHaveURL(/\/signin\?error=pupil_account$/);
  await expect(page.getByRole("alert")).toHaveText("This account signs in as a pupil. Pupils sign in on the pupil page.");
});
