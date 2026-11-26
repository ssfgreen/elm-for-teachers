/**
 * The Word preview's fonts. docx-preview names only the Word font (`font-family: Calibri`), so a
 * machine without it, like this browser, would draw the browser's default serif. The preview
 * stands in the free twin with the same letter widths, as the editor does.
 */
import { expect, test, type Page } from "@playwright/test";

const ADMIN = { Authorization: "Bearer e2e-password" };
const TEXT = "Read the sentence and find the simile.";

/** How wide the preview draws TEXT, and how wide it is in `twin`, at the same size and weight. */
async function widths(page: Page, twin: string) {
  return page.locator(".word-preview section.docx span", { hasText: TEXT }).first().evaluate(async (span, twin) => {
    await document.fonts.ready;
    const probe = document.createElement("span");
    const cs = getComputedStyle(span);
    probe.style.cssText = `font: ${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${twin}; white-space: pre; position: absolute;`;
    probe.textContent = span.textContent;
    document.body.append(probe);
    await document.fonts.load(probe.style.font, probe.textContent);
    const out = { preview: span.getBoundingClientRect().width, twin: probe.getBoundingClientRect().width };
    probe.remove();
    return out;
  }, twin);
}

test("the preview draws a doc in Calibri with Carlito, and Georgia with Gelasio, where the machine lacks them", async ({ page, request }) => {
  const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: "E2E preview fonts" } });
  const ws = ((await res.json()) as { session: { participant_token: string } }).session;
  await page.goto(`/s/${ws.participant_token}`);
  await expect(page.locator(".doc-title")).toHaveText("Untitled");
  await page.locator(".canvas-pm").click();
  await page.keyboard.type(TEXT);

  const preview = async () => {
    await page.getByRole("button", { name: "Preview in Word" }).click();
    await expect(page.getByRole("dialog").getByText(/A4 · 1 page/)).toBeVisible();
  };
  await preview();
  const calibri = await widths(page, "Carlito");
  expect(calibri.preview).toBeCloseTo(calibri.twin, 0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Document font: Calibri" }).click();
  await page.getByRole("menu", { name: "Document font" }).getByRole("menuitemradio", { name: "Georgia" }).click();
  await preview();
  const georgia = await widths(page, "Gelasio");
  expect(georgia.preview).toBeCloseTo(georgia.twin, 0);
});

/**
 * Fonts no longer offered, kept by docs from older sessions. The menu cannot set one, so the save
 * of a font it does offer is rewritten on its way to the server, and the page loaded again.
 */
for (const old of [
  { font: "comic_sans", label: "Comic Sans", twin: "'Comic Neue'" },
  { font: "century_gothic", label: "Century Gothic", twin: "Arimo" },
  { font: "verdana", label: "Verdana", twin: "Arimo" },
]) {
  test(`the preview draws an older doc set in ${old.label} with ${old.twin}, not the browser's serif`, async ({ page, request }) => {
    const res = await request.post("/api/admin/sessions", { headers: ADMIN, data: { label: `E2E old font ${old.font}` } });
    const ws = ((await res.json()) as { session: { session_id: string; participant_token: string } }).session;
    await page.route("**/blocks/doc_style", async (route) => {
      const body = route.request().postDataJSON() as { style: { font?: string } };
      await route.continue({ postData: JSON.stringify({ ...body, style: { ...body.style, font: old.font } }) });
    });
    await page.goto(`/s/${ws.participant_token}`);
    await page.locator(".canvas-pm").click();
    await page.keyboard.type(TEXT);
    await page.getByRole("button", { name: "Document font: Calibri" }).click();
    const saved = page.waitForResponse((r) => r.url().includes("/blocks/doc_style"));
    await page.getByRole("menu", { name: "Document font" }).getByRole("menuitemradio", { name: "Georgia" }).click();
    expect((await saved).ok()).toBe(true);
    await expect.poll(async () => {
      const files = await request.get(`/api/admin/sessions/${ws.session_id}/export.json`, { headers: ADMIN });
      return ((await files.json()) as Record<string, string>)["blocks.json"] ?? "";
    }, { timeout: 10_000 }).toContain(TEXT);

    await page.reload();
    await expect(page.getByRole("button", { name: `Document font: ${old.label}` })).toBeVisible();
    await page.getByRole("button", { name: "Preview in Word" }).click();
    await expect(page.getByRole("dialog").getByText(/A4 · 1 page/)).toBeVisible();
    const drawn = await widths(page, old.twin);
    expect(drawn.preview).toBeCloseTo(drawn.twin, 0);
    const serif = await widths(page, "serif");
    expect(Math.abs(serif.preview - serif.twin)).toBeGreaterThan(5);
  });
}
