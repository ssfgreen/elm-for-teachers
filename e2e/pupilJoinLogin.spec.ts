/**
 * A pupil signs up on /r/join with the class code and a teacher's login, then logs in on /r/login
 * (#245), from the front page's Sign up and Log in. Five wrong passwords lock the login. The pages
 * call no workspace route and send no events; no username, password or code is ever in a URL, and
 * the username and password are never in the page's markup.
 */
import { expect, test } from "@playwright/test";
import { pupilClass } from "./pupilClass";

const envelope = () => ({ client_ts: new Date().toISOString(), focus_pane: "none", doc_id: null, thread_id: null });

test("a pupil signs up with the code and their login, signs out, logs in again; five wrong passwords lock it", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const forbidden: string[] = [];
  const urls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/sessions/") || r.url().includes("/api/events")) forbidden.push(r.url());
  });
  page.on("framenavigated", (f) => urls.push(f.url()));

  // The teacher makes one login through the route.
  const c = await pupilClass(request, "E2E join and login");
  const made = await request.post(`/api/sessions/${c.sessionId}/classes/${c.classId}/logins`, { headers: { Authorization: `Bearer ${c.token}` }, data: { count: 1, envelope: envelope() } });
  expect(made.ok()).toBe(true);
  const [login] = ((await made.json()) as { logins: { username: string; password: string }[] }).logins;
  const { username, password } = login!;
  const signedIn = page.getByRole("heading", { name: `You are Pupil 1 in ${c.className}` });

  // Sign up: /, Sign up, I am a pupil, the code, Next, username and password.
  await page.goto("/");
  await page.getByRole("link", { name: "Sign up" }).first().click();
  await page.getByRole("link", { name: "I am a pupil" }).click();
  await expect(page).toHaveURL(/\/r\/join$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign up");
  await page.getByLabel("Class code").fill(c.code.toLowerCase());
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText(`Class code ${c.code}`)).toBeVisible();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  // Typed, neither is in the page's markup (no value attribute).
  expect(await page.content()).not.toContain(username);
  expect(await page.content()).not.toContain(password);
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/r$/);
  await expect(signedIn).toBeVisible();

  // Sign out: on to Log in.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/r\/login\?signed_out=1$/);
  await expect(page.getByRole("status")).toHaveText("You have signed out.");

  // Log in: /, Log in, I am a pupil, username and password, no code.
  await page.goto("/");
  await page.getByRole("banner").getByRole("link", { name: "Log in", exact: true }).click();
  await page.getByRole("link", { name: "I am a pupil" }).click();
  await expect(page).toHaveURL(/\/r\/login$/);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/r$/);
  await expect(signedIn).toBeVisible();

  // Five wrong passwords lock the login.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/r\/login/);
  for (let i = 0; i < 5; i++) {
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(`wrong-${i}`);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByLabel("Password")).toHaveValue("");
  }
  await expect(page.getByRole("alert")).toContainText("Ask your teacher for a new password");
  await expect(page.getByLabel("Username")).toHaveValue(username);

  expect(forbidden).toEqual([]);
  for (const url of urls) {
    for (const secret of [username, password, c.code, c.code.replace("-", "")]) expect(url.toLowerCase()).not.toContain(secret.toLowerCase());
  }
  expect(errors).toEqual([]);
});
