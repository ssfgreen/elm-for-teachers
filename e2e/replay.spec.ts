/**
 * The replay player in a real browser: a teacher types in a workspace, then /admin's Replay link
 * loads the workspace's bundle and plays the typing back.
 */
import { expect, test, type Locator } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };

/**
 * Whether the replayed page draws `text` in one of the fonts bundled with the app (the free twins
 * of Calibri and Comic Sans), not in a fallback of the browser's: its width beside the same words
 * set in each, measured inside the page so the stage's scale applies to both.
 */
async function drawnInBundledFont(stage: Locator, text: string) {
  return stage.locator(".canvas-pm").getByText(text).evaluate(async (el) => {
    await document.fonts.ready;
    const cs = getComputedStyle(el);
    const width = async (family: string | null) => {
      const probe = document.createElement("span");
      probe.style.cssText = `white-space: pre; position: absolute;${family ? ` font-family: ${family};` : ""}`;
      probe.textContent = el.textContent;
      el.closest(".canvas")!.append(probe);
      if (family) await document.fonts.load(`${cs.fontWeight} ${cs.fontSize} ${family}`, probe.textContent ?? "");
      const w = probe.getBoundingClientRect().width;
      probe.remove();
      return w;
    };
    const drawn = await width(null);
    const twins = [await width("Carlito"), await width("'Comic Neue'")];
    return twins.some((w) => Math.abs(w - drawn) < 0.5);
  });
}

test("admin replays a workspace: the typing comes back, and play, fast-forward and rewind work", async ({ page, request }) => {
  const label = `E2E replay ${Date.now()}`;
  const created = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label } });
  const ws = ((await created.json()) as { session: { session_id: string; participant_token: string } }).session;

  await page.goto(`/s/${ws.participant_token}`);
  await page.locator(".canvas-pm").click();
  await page.keyboard.type("Played back later", { delay: 40 });
  await expect.poll(async () => {
    const res = await request.get(`/api/admin/sessions/${ws.session_id}/export.json`, { headers: ADMIN });
    return ((await res.json()) as Record<string, string>)["blocks.json"] ?? "";
  }, { timeout: 10_000 }).toContain("Played back later");

  await page.goto("/admin");
  await page.getByLabel("Password").fill("e2e-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("row").filter({ hasText: label }).getByRole("link", { name: `Replay ${label}`, exact: true }).click();

  await expect(page.getByRole("heading", { name: label })).toBeVisible();
  const stage = page.locator(".replay-stage");
  const bar = page.getByLabel("Position in the replay");
  await bar.fill(await bar.getAttribute("max") ?? "");
  await expect(stage).toContainText("Played back later");
  // A doc with no font: in the default (Calibri), which the app draws with Carlito here.
  expect(await drawnInBundledFont(stage, "Played back later")).toBe(true);
  await bar.fill(await bar.getAttribute("min") ?? "");
  await expect(stage).not.toContainText("Played back later");

  const ff = page.getByRole("button", { name: "Fast forward", exact: true });
  await ff.click();
  await expect(ff).toHaveText("×2");
  await ff.click();
  await expect(ff).toHaveText("×5");
  await expect(stage).toContainText("Played back later", { timeout: 15_000 });
  const rw = page.getByRole("button", { name: "Rewind", exact: true });
  await rw.click();
  await expect(rw).toHaveText("×2");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
});

// The replay does not read a doc's font today (replay/snapshot.ts builds docs without their style),
// so this passes for any stored font: the page is drawn in the default. It holds the outcome, and
// would catch a font that cannot be drawn if the replay comes to follow the doc's style.
test("admin replays a doc set in Comic Sans, a font no longer offered: it is drawn in a font the app has", async ({ page, request }) => {
  const label = `E2E replay old font ${Date.now()}`;
  const created = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label } });
  const ws = ((await created.json()) as { session: { session_id: string; participant_token: string } }).session;
  // The menu cannot set Comic Sans any more: the save of a font it offers is rewritten on its way.
  await page.route("**/blocks/doc_style", async (route) => {
    const body = route.request().postDataJSON() as { style: { font?: string } };
    await route.continue({ postData: JSON.stringify({ ...body, style: { ...body.style, font: "comic_sans" } }) });
  });

  await page.goto(`/s/${ws.participant_token}`);
  await page.locator(".canvas-pm").click();
  await page.keyboard.type("Set in Comic Sans");
  await page.getByRole("button", { name: "Document font: Calibri" }).click();
  const saved = page.waitForResponse((r) => r.url().includes("/blocks/doc_style"));
  await page.getByRole("menu", { name: "Document font" }).getByRole("menuitemradio", { name: "Georgia" }).click();
  expect((await saved).ok()).toBe(true);
  await expect.poll(async () => {
    const res = await request.get(`/api/admin/sessions/${ws.session_id}/export.json`, { headers: ADMIN });
    const files = (await res.json()) as Record<string, string>;
    return `${files["blocks.json"] ?? ""}${files["docs.json"] ?? ""}`;
  }, { timeout: 10_000 }).toMatch(/Set in Comic Sans[^]*comic_sans/);

  await page.goto("/admin");
  await page.getByLabel("Password").fill("e2e-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("row").filter({ hasText: label }).getByRole("link", { name: `Replay ${label}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: label })).toBeVisible();
  const stage = page.locator(".replay-stage");
  const bar = page.getByLabel("Position in the replay");
  await bar.fill(await bar.getAttribute("max") ?? "");
  await expect(stage).toContainText("Set in Comic Sans");
  expect(await drawnInBundledFont(stage, "Set in Comic Sans")).toBe(true);
});
