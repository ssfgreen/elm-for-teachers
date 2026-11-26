import { expect, test } from "@playwright/test";

// Issue #60: where the server takes the admin password (here, as off Vercel and on a preview),
// /signin has Username and Password under the provider buttons, and "admin" with the password
// opens /admin for the tab with no second prompt.
test("on /signin, admin and the password land on /admin signed in", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByRole("link", { name: "Continue with Test issuer" })).toBeVisible();

  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("That username or password is not right.");
  await expect(page).toHaveURL(/\/signin$/);

  await page.getByLabel("Username").fill(" Admin ");
  await page.getByLabel("Password").fill("e2e-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Workspaces" })).toBeVisible();

  // Kept for the tab: a reload stays in.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Workspaces" })).toBeVisible();
  await expect(page.getByLabel("Password")).toHaveCount(0);

  // Signing out forgets it.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByLabel("Password")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Password")).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("edw.admin.password"))).toBeNull();
});
