import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { becomeSomeone } from "./fakePerson";

// An admin signs in on /admin through the fake issuer, makes an invite, a second teacher signs
// up with it in another browser, and the list shows their workspace as signed in. Each browser
// is its own person (a `fake_sub` cookie), so this runs beside the other sign-in specs.
const ADMIN = { Authorization: "Bearer e2e-password" };

/** Through the fake issuer and back; it approves at once. */
async function signInWith(page: Page, invite: string) {
  await page.goto(`/api/auth/test/start?invite=${encodeURIComponent(invite)}`);
}

/** Signs this browser out by dropping its cookies, but stays the same person at the issuer. */
async function forgetSignIn(context: BrowserContext) {
  for (const c of await context.cookies()) if (c.name !== "fake_sub") await context.clearCookies({ name: c.name });
}

test("an admin signs in, invites a teacher, and the list shows them signed in", async ({ browser, request }) => {
  const run = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const adminLabel = `E2E admin ${run}`;

  // Set-up: the admin's account, made by an invite and then marked admin (with the local password).
  const made = await request.post("/api/admin/invites", { headers: ADMIN, data: { label: adminLabel } });
  const adminCode = ((await made.json()) as { code: string }).code;
  const adminCtx = await browser.newContext();
  await becomeSomeone(adminCtx, "admin");
  const page = await adminCtx.newPage();
  await signInWith(page, adminCode);
  await expect(page).toHaveURL(/\/w$/);
  const { accounts } = (await (await request.get("/api/admin/accounts", { headers: ADMIN })).json()) as {
    accounts: { id: string; workspace: { label: string } }[];
  };
  const adminId = accounts.find((a) => a.workspace.label === adminLabel)!.id;
  expect((await request.put(`/api/admin/accounts/${adminId}/admin`, { headers: ADMIN, data: { admin: true } })).status()).toBe(204);

  // Signed out, /admin offers the sign-in (and, locally, the password).
  await forgetSignIn(adminCtx);
  await page.goto("/admin");
  await expect(page.getByLabel("Password")).toBeVisible();
  await page.getByRole("link", { name: "Sign in with Test issuer" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Workspaces" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Your workspace" })).toHaveAttribute("href", "/w");
  // The fake issuer gives no name or email, so the switch is named after the workspace.
  await expect(page.getByRole("switch", { name: `Admin: ${adminLabel}` })).toBeChecked();

  // The invite.
  const label = `E2E teacher ${run}`;
  const invites = page.getByRole("region", { name: "Invites" });
  await invites.getByLabel(/Label/).fill(label);
  await invites.getByRole("button", { name: "Make" }).click();
  const shown = invites.getByRole("status");
  await expect(shown).toContainText("/join/");
  const code = (await shown.locator("code").first().textContent())!;
  await expect(invites.getByRole("row").filter({ hasText: label })).toContainText("Open");

  // A second teacher, in another browser, signs up with it.
  const teacherCtx = await browser.newContext();
  await becomeSomeone(teacherCtx, "teacher");
  const teacher = await teacherCtx.newPage();
  await signInWith(teacher, code);
  await expect(teacher).toHaveURL(/\/w$/);

  // Back on the list: their workspace is reached by signing in, and the invite is used.
  await page.reload();
  const row = page.getByRole("row").filter({ hasText: label }).first();
  await expect(row).toContainText("Signed in with Test issuer");
  await expect(invites.getByRole("row").filter({ hasText: label })).toContainText("Used");

  // A teacher who is not an admin is told so.
  await teacher.goto("/admin");
  await expect(teacher.getByText("This account cannot open the admin pages.")).toBeVisible();

  await teacherCtx.close();
  await adminCtx.close();
});
