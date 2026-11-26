/**
 * A new password for a pupil login (#246), with the e2e server's PUPILS=on. The teacher makes one
 * login; the pupil signs in through `POST /api/pupil/login` from the site's origin with the class
 * code (no pupil screens needed); five wrong passwords make the card show Locked; New password,
 * twice, shows the new one once, titled "New password". Then the old password is refused, the old
 * cookie no longer works, the new password signs in, and after a reload the login is not Locked.
 * The research data has `pupil_password_reset` once, the class id only, and neither password.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";
import { pupilClass } from "./pupilClass";

const ADMIN = { Authorization: "Bearer e2e-password" };

type Logged = { kind: string; payload: Record<string, unknown> };

async function exported(request: APIRequestContext, sessionId: string): Promise<{ text: string; events: Logged[] }> {
  const res = await request.get(`/api/admin/sessions/${sessionId}/export.json`, { headers: ADMIN });
  expect(res.ok()).toBe(true);
  const files = (await res.json()) as Record<string, string>;
  const events = files["events.jsonl"]!.trim().split("\n").map((l) => JSON.parse(l) as Logged);
  return { text: JSON.stringify(files), events };
}

test("a locked login gets a new password: the old one and its sign-in stop, the new one works, logged once with the class id", async ({ page, request, playwright, baseURL }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const c = await pupilClass(request, "E2E login reset");

  const openClass = () => page.getByRole("region", { name: "Classes" }).getByRole("button", { name: c.className }).click();
  await page.goto(`/s/${c.token}`);
  await openClass();
  const card = page.getByRole("region", { name: "Pupil logins" });
  await card.getByRole("spinbutton", { name: "How many" }).fill("1");
  await card.getByRole("button", { name: "Make 1 login" }).click();
  const made = card.getByRole("group", { name: "New logins" });
  const username = await made.getByRole("textbox", { name: "Username" }).inputValue();
  const oldPassword = await made.getByRole("textbox", { name: "Password" }).inputValue();
  await made.getByRole("button", { name: "Done" }).click();
  await card.getByRole("group", { name: "Hide the passwords" }).getByRole("button", { name: "Done" }).click();

  // The pupil, in a browser of their own: signs in once with the code, keeping the cookie.
  const pupil = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL! } });
  const login = (password: string) => pupil.post("/api/pupil/login", { data: { username, password, code: c.code } });
  expect((await login(oldPassword)).status()).toBe(204);
  const state = await pupil.storageState();
  expect((await pupil.get("/api/pupil/me")).status()).toBe(200);
  for (let i = 0; i < 5; i++) await login("wrong-wrong-000");
  await page.reload();
  await openClass();
  const row = card.getByRole("list", { name: "Logins" }).getByRole("listitem");
  await expect(row).toContainText("Locked");

  await row.getByRole("button", { name: "New password" }).click();
  const ask = card.getByRole("group", { name: "New password" });
  await expect(ask).toContainText("Make a new password? The old one stops working at once and the pupil is signed out.");
  await ask.getByRole("button", { name: "Make new password" }).click();
  const shown = card.getByRole("group", { name: "New password" });
  await expect(shown.getByRole("textbox", { name: "Password" })).toHaveCount(1);
  expect(await shown.getByRole("textbox", { name: "Username" }).inputValue()).toBe(username);
  const newPassword = await shown.getByRole("textbox", { name: "Password" }).inputValue();
  expect(newPassword).not.toBe(oldPassword);
  await expect(row).not.toContainText("Locked");

  // The old sign-in, as it was before the change: no longer works.
  const old = await playwright.request.newContext({ baseURL, storageState: state });
  expect((await old.get("/api/pupil/me")).status()).toBe(401);
  await old.dispose();
  expect((await login(oldPassword)).status()).toBe(401);
  expect((await login(newPassword)).status()).toBe(204);
  expect((await pupil.get("/api/pupil/me")).status()).toBe(200);
  await pupil.dispose();

  await shown.getByRole("button", { name: "Done" }).click();
  await card.getByRole("group", { name: "Hide the passwords" }).getByRole("button", { name: "Done" }).click();
  await page.reload();
  await openClass();
  await expect(row).toHaveCount(1);
  await expect(row).not.toContainText("Locked");
  await expect(card.getByRole("group", { name: "New password" })).toHaveCount(0);
  expect(await page.content()).not.toContain(newPassword);

  await expect.poll(async () => (await exported(request, c.sessionId)).events.filter((e) => e.kind === "pupil_password_reset").length, { timeout: 10_000 }).toBe(1);
  const { text, events } = await exported(request, c.sessionId);
  expect(events.find((e) => e.kind === "pupil_password_reset")!.payload).toEqual({ class_id: c.classId });
  for (const s of [oldPassword, newPassword]) expect(text).not.toContain(s);
  expect(errors).toEqual([]);
});
