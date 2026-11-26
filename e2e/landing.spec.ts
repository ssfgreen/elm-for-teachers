/**
 * The front door (issue #31, and #68's /start): `/`, `/start`, `/join/:code` and `/signin`,
 * against the built server and the fake issuer (e2e/fake-issuer.mjs). Each sign-in is a new person (`becomeSomeone`,
 * e2e/fakePerson.ts), so the order of tests does not matter: an existing account would sign
 * in whatever the invite.
 */
import { expect, test } from "@playwright/test";
import { becomeSomeone } from "./fakePerson";

const ADMIN = { Authorization: "Bearer e2e-password" };
test("Sign up, I am a teacher, then an access code typed on /start, opens its workspace", async ({ page, request }) => {
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: "E2E landing access" } });
  const { session } = (await res.json()) as { session: { participant_token: string; access_code: string } };
  expect(session.access_code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ELM for teachers");
  await page.getByRole("link", { name: "Sign up" }).first().click();
  await page.getByRole("link", { name: "I am a teacher" }).click();
  await expect(page).toHaveURL("/start");
  await expect(page.getByLabel("Invite code", { exact: true })).toBeFocused();
  // Lower case and spaces, as a teacher might type it.
  await page.getByLabel("Access code", { exact: true }).fill(` ${session.access_code.toLowerCase().replace(/-/g, " ")} `);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(page).toHaveURL(`/s/${session.participant_token}`);
  await expect(page.getByRole("region", { name: "Chat", exact: true })).toBeVisible();
});

test("a wrong access code says so", async ({ page }) => {
  await page.goto("/start");
  await page.getByLabel("Access code", { exact: true }).fill("ZZZZ-ZZZZ-ZZZZ");
  await page.getByLabel("Access code", { exact: true }).press("Enter");
  await expect(page.getByRole("alert")).toHaveText("That access code was not recognised. Please check it, or ask the person who gave it to you.");
  await expect(page.getByLabel("Access code", { exact: true })).toBeFocused();
});

test("an invite code and the test issuer sign a new teacher up and land on /w", async ({ page, request }) => {
  const res = await request.post("/api/admin/invites", { headers: ADMIN, data: { label: "E2E landing invite" } });
  expect(res.status()).toBe(201);
  const { code } = (await res.json()) as { code: string };
  await becomeSomeone(page, "landing");

  await page.goto("/start");
  await page.getByLabel("Invite code", { exact: true }).fill(code);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(`/join/${code}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign up with your invite code");
  await page.getByRole("link", { name: "Continue with Test issuer" }).click();
  await expect(page).toHaveURL("/w");

  // Signed in, the front page offers the workspace instead of the codes.
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Open your workspace" })).toHaveAttribute("href", "/w");
  await expect(page.getByRole("banner").getByRole("link", { name: "Your workspace" })).toHaveAttribute("href", "/w");
  await expect(page.getByRole("link", { name: "Log in", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  await expect(page.getByLabel("Invite code", { exact: true })).toHaveCount(0);
});

test("an unknown invite code comes back to /signin with its message", async ({ page }) => {
  await becomeSomeone(page, "landing");
  await page.goto("/join/ZZZZ-ZZZZ-ZZZZ");
  await page.getByRole("link", { name: "Continue with Test issuer" }).click();
  await expect(page).toHaveURL("/signin?error=invite_unknown");
  await expect(page.getByRole("alert")).toHaveText("That invite code was not recognised. Please check it.");
  await expect(page.getByRole("link", { name: "Continue with Test issuer" })).toBeFocused();
});

test("with no provider set up there are no sign-in buttons", async ({ page }) => {
  await page.route("**/api/auth/providers", (route) => route.fulfill({ json: { providers: [] } }));
  // As in production, where the admin password is refused: otherwise /signin shows its form (#60).
  await page.route("**/api/admin/me", (route) => route.fulfill({ status: 401, json: { error: "admin sign-in required", password: false } }));
  await page.goto("/signin");
  await expect(page.getByText("Sign-in is not set up here yet.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Continue with/ })).toHaveCount(0);
  await page.goto("/join/ABCD-EFGH-JKMN");
  await expect(page.getByText("Sign-in is not set up here yet.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Continue with/ })).toHaveCount(0);
});

test("unknown paths and a bad workspace link are unchanged", async ({ page }) => {
  await page.goto("/no-such-page");
  await expect(page.getByText("Please use the link you were given.")).toBeVisible();
  await page.goto("/s/not-a-real-token");
  await expect(page.getByText("This link could not be opened. Please check it, or ask for a new one.")).toBeVisible();
});

test("the front page's sections are there, its one action is Sign up and Log in is in the nav (#224)", async ({ page }) => {
  await page.goto("/");
  for (const title of ["A worksheet editor with an assistant beside it", "A turn, from request to decision", "Pupils' data and the research study", "Questions teachers ask"]) {
    await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
  }
  await expect(page.getByLabel("Access code", { exact: true })).toHaveCount(0);
  // #224 changed this on purpose: the nav's Sign in (#173) and Pupils (#179) are one Log in.
  const logIn = page.getByRole("banner").getByRole("link", { name: "Log in", exact: true });
  await expect(logIn).toHaveAttribute("href", "/login");
  await expect(page.getByRole("link", { name: "Log in", exact: true })).toHaveCount(1);
  await page.getByText("Will the assistant change my worksheet without asking?").click();
  await expect(page.getByText("Not unless you let it.", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Sign up" }).last().click();
  await expect(page).toHaveURL("/signup");
  await page.getByRole("link", { name: "I am a teacher" }).click();
  await expect(page).toHaveURL("/start");
  await expect(page.getByRole("link", { name: "Log in", exact: true })).toHaveAttribute("href", "/signin");
});

test("at phone width the front page and /start fit, with Sign up on the first screen (#68, #224)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/start"]) {
    await page.goto(path);
    const widths = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(widths[0]).toBeLessThanOrEqual(widths[1]);
  }
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign up" }).first()).toBeInViewport();
  await expect(page.getByRole("banner").getByRole("link", { name: "Log in", exact: true })).toBeInViewport();
});

test("Log in in the nav sits top right and opens /login (#173, #224)", async ({ page }) => {
  await page.goto("/");
  const signIn = page.getByRole("banner").getByRole("link", { name: "Log in", exact: true });
  const box = (await signIn.boundingBox())!;
  const width = page.viewportSize()!.width;
  expect(box.x + box.width).toBeGreaterThan(width - 120);
  expect(box.y).toBeLessThan(80);
  await signIn.click();
  await expect(page).toHaveURL("/login");
});
