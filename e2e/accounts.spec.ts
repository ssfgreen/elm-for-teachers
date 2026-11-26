/**
 * The signed-in workspace in a real browser: an invite, sign-in through the fake issuer
 * (playwright.config.ts), the "Before you start" notice, typing, a reload, signing out (the
 * last typing is saved first) and signing in again to the same document.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { becomeSomeone } from "./fakePerson";

const ADMIN = { Authorization: "Bearer e2e-password" };


async function newInvite(request: APIRequestContext, label: string) {
  const res = await request.post("/api/admin/invites", { headers: ADMIN, data: { label } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { code: string }).code;
}

/** The open doc's text as the server has it, read with the workspace token. */
async function savedText(request: APIRequestContext, ws: { session_id: string; token: string }) {
  const res = await request.get(`/api/sessions/${ws.session_id}/canvas`, { headers: { Authorization: `Bearer ${ws.token}` } });
  expect(res.ok()).toBe(true);
  return JSON.stringify(await res.json());
}

const editor = (page: Page) => page.locator(".canvas-pm");

test("invite, sign in, notice, type, reload, sign out, sign in again", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await becomeSomeone(page);
  const code = await newInvite(request, "E2E signed in");

  // Sign in through the invite: the fake issuer approves at once and the server lands on /w.
  await page.goto(`/api/auth/test/start?invite=${code}`);
  await expect(page).toHaveURL(/\/w$/);

  // First visit: the notice, with the information sheet opening in a new tab.
  await expect(page.getByRole("heading", { name: "Before you start" })).toBeVisible();
  await expect(page.getByText("reference number 541809.")).toBeVisible();
  await expect(page.getByRole("link", { name: /drive\.google\.com/ })).toHaveAttribute("target", "_blank");
  const go = page.getByRole("button", { name: "Continue" });
  await expect(go).toBeDisabled();
  await page.getByRole("checkbox", { name: "I have read this." }).check();
  await go.click();

  // The workspace, with no token in the address or in the browser's storage.
  await expect(page.locator(".doc-title")).toHaveText("Untitled");
  await expect(page).toHaveURL(/\/w$/);
  const ws = (await (await page.request.get("/api/account/workspace")).json()) as { session_id: string; token: string };
  const stored = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));
  expect(stored + JSON.stringify(await page.context().cookies())).not.toContain(ws.token);

  await editor(page).click();
  await page.keyboard.type("Signed-in notes.", { delay: 20 });
  await page.waitForTimeout(800);

  // Reload: still signed in, no notice again, the same doc.
  await page.reload();
  await expect(editor(page)).toContainText("Signed-in notes.");
  await expect(page.getByRole("heading", { name: "Before you start" })).toHaveCount(0);

  // Type and sign out at once: the typing is saved before the sign-in ends.
  await editor(page).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(" Last words.", { delay: 20 });
  await page.getByRole("button", { name: /^Account:/ }).click();
  const items = page.getByRole("menu", { name: "Account" }).locator('[role^="menuitem"]');
  await expect(items.last()).toHaveText("Sign out");
  // Hold the sign-out for a moment: while it waits, the keyboard cannot reach the editor.
  await page.route("**/api/auth/sign-out", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await items.last().click();
  await expect(page.getByRole("status")).toContainText("Saving your work and signing out");
  // Tab from the top of the page, and focus put straight on the editor: neither gets in.
  for (let i = 0; i < 40; i++) await page.keyboard.press("Tab");
  await page.keyboard.type("TABBED TOO LATE");
  await editor(page).evaluate((el: HTMLElement) => el.focus());
  await page.keyboard.type("TYPED TOO LATE");
  await expect(page).toHaveURL(/\/signin\?signed_out=1$/);
  await expect(page.getByText("You have signed out.")).toBeVisible();
  await page.unroute("**/api/auth/sign-out");
  expect(await savedText(request, ws)).toContain("Last words.");

  // Signed out for real: the server no longer knows this browser, and /w sends it to sign in.
  expect((await page.request.get("/api/account/workspace")).status()).toBe(401);
  await page.goto("/w");
  await expect(page).toHaveURL(/\/signin$/);

  // Sign in again, with no invite: the same workspace and doc, and no notice.
  await page.goto("/api/auth/test/start");
  await expect(page).toHaveURL(/\/w$/);
  await expect(editor(page)).toContainText("Signed-in notes. Last words.");
  await expect(page.locator("body")).not.toContainText("TOO LATE");
  expect(await savedText(request, ws)).not.toContain("TOO LATE");
  await expect(page.getByRole("heading", { name: "Before you start" })).toHaveCount(0);
  expect(errors).toEqual([]);
});
