import { expect, type Page } from "@playwright/test";

/**
 * A new pupil signs up with the class code through the fake issuer (#245): /r/join, the code,
 * Next, Continue with Test issuer. The server lands them back on /r. Call `becomeSomeone` first.
 */
export async function pupilSignUp(page: Page, code: string): Promise<void> {
  await page.goto("/r/join");
  await page.getByLabel("Class code").fill(code);
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("link", { name: "Continue with Test issuer" }).click();
  await expect(page).toHaveURL(/\/r$/);
}
