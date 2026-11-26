/**
 * The Dashboard link (#79): an admin signs in and lands on /w, sees "Dashboard" just above the
 * account chip, types and clicks it at once, and the typing is saved before the page goes (the
 * editor's requests are held, so the page must wait). Back from /admin, with the browser's
 * back-forward cache on, gives a working workspace. A teacher sees no Dashboard. Each browser is its own person at the fake issuer.
 */
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import { becomeSomeone } from './fakePerson';

const ADMIN = { Authorization: 'Bearer e2e-password' };
const editor = (page: Page) => page.locator('.canvas-pm');

async function newInvite(request: APIRequestContext, label: string) {
  const res = await request.post('/api/admin/invites', { headers: ADMIN, data: { label } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { code: string }).code;
}

/** Signs in with the invite and ticks "Before you start", leaving the person in their workspace. */
async function signUp(page: Page, code: string) {
  await page.goto(`/api/auth/test/start?invite=${encodeURIComponent(code)}`);
  await expect(page).toHaveURL(/\/w$/);
  await page.getByRole('checkbox', { name: 'I have read this.' }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.doc-title')).toHaveText('Untitled');
}

/** Drops this browser's sign-in, but it stays the same person at the issuer. */
async function forgetSignIn(context: BrowserContext) {
  for (const c of await context.cookies())
    if (c.name !== 'fake_sub') await context.clearCookies({ name: c.name });
}

/** The open doc's text as the server has it. */
async function savedText(page: Page, request: APIRequestContext) {
  const ws = (await (await page.request.get('/api/account/workspace')).json()) as {
    session_id: string;
    token: string;
  };
  const res = await request.get(`/api/sessions/${ws.session_id}/canvas`, {
    headers: { Authorization: `Bearer ${ws.token}` },
  });
  expect(res.ok()).toBe(true);
  return JSON.stringify(await res.json());
}

/** A new person, signed up, made an admin (with the local password), then signed in afresh: lands on /w. */
async function adminAtWorkspace(browser: Browser, request: APIRequestContext, baseURL?: string) {
  const label = `E2E dashboard ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const context = await browser.newContext(baseURL ? { baseURL } : {});
  await becomeSomeone(context, 'dash');
  const page = await context.newPage();
  await signUp(page, await newInvite(request, label));
  const { accounts } = (await (
    await request.get('/api/admin/accounts', { headers: ADMIN })
  ).json()) as {
    accounts: { id: string; workspace: { label: string } }[];
  };
  const id = accounts.find((a) => a.workspace.label === label)!.id;
  expect(
    (
      await request.put(`/api/admin/accounts/${id}/admin`, {
        headers: ADMIN,
        data: { admin: true },
      })
    ).status(),
  ).toBe(204);
  await forgetSignIn(context);
  await page.goto('/api/auth/test/start');
  await expect(page).toHaveURL(/\/w$/);
  return { context, page };
}

/** The editor's requests to the server: its commands (`/blocks/...`) and the logged events. */
const EDITOR_SYNC = /\/api\/sessions\/[^/]+\/(blocks\/|events)/;

test('an admin lands on /w, and Dashboard saves the last typing before going to /admin', async ({
  browser,
  request,
}) => {
  const { context, page } = await adminAtWorkspace(browser, request);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // "Dashboard" is the last row of the sidebar, just above the account chip.
  const dashboard = page.getByRole('link', { name: 'Dashboard' });
  const chip = page.getByRole('button', { name: /^Account:/ });
  await expect(dashboard).toBeVisible();
  const [d, c] = [(await dashboard.boundingBox())!, (await chip.boundingBox())!];
  expect(d.y + d.height).toBeLessThanOrEqual(c.y);
  expect(c.y - (d.y + d.height)).toBeLessThan(24);

  // Type, then hold the editor's requests for 2 s and click Dashboard at once. The page must
  // wait for them: without the save it would leave at once, and the typing would be lost.
  await editor(page).click();
  await page.keyboard.type('Before the dashboard.', { delay: 20 });
  const releaseAt = Date.now() + 2000;
  await page.route(EDITOR_SYNC, async (route) => {
    await new Promise((r) => setTimeout(r, Math.max(0, releaseAt - Date.now())));
    await route.continue().catch(() => undefined);
  });
  await dashboard.click();
  await expect(page.getByRole('status')).toContainText('Saving your work');
  // While it waits, the keyboard cannot reach the editor (inert), from Tab or from focus.
  for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
  await page.keyboard.type('TABBED TOO LATE');
  await editor(page).evaluate((el: HTMLElement) => el.focus());
  await page.keyboard.type('TYPED TOO LATE');
  await page.waitForTimeout(Math.max(0, releaseAt - Date.now() - 300));
  expect(page.url()).toMatch(/\/w$/);

  await expect(page).toHaveURL(/\/admin$/);
  await page.unroute(EDITOR_SYNC);
  await expect(page.getByRole('heading', { name: 'Workspaces' })).toBeVisible();
  const saved = await savedText(page, request);
  expect(saved).toContain('Before the dashboard.');
  expect(saved).not.toContain('TOO LATE');

  // And back: still signed in, the same doc.
  await page.getByRole('link', { name: 'Your workspace' }).click();
  await expect(page).toHaveURL(/\/w$/);
  await expect(editor(page)).toContainText('Before the dashboard.');
  await expect(page.locator('body')).not.toContainText('TOO LATE');
  expect(errors).toEqual([]);
  await context.close();
});

/**
 * A browser with the back-forward cache on. Playwright turns it off by default; a teacher's
 * browser has it on. Its own browser, since launch options cannot change for one test. Full
 * Chromium (`channel: 'chromium'`), not the headless shell Playwright uses by default: the
 * shell has no back-forward cache at all, so Back there is always a fresh load.
 */
async function withCacheOn(
  playwright: PlaywrightWorkerArgs['playwright'],
  run: (browser: Browser) => Promise<void>,
) {
  const cached = await playwright.chromium.launch({
    ...(process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : { channel: 'chromium' }),
    ignoreDefaultArgs: ['--disable-back-forward-cache'],
  });
  try {
    await run(cached);
  } finally {
    await cached.close();
  }
}

/** Marks this page in memory: the mark survives a restore from the cache, and not a load. */
const markPage = (page: Page) =>
  page.evaluate(() => void ((window as { edwMark?: true }).edwMark = true));
/** Whether the page in the tab is the same one `markPage` marked, and how it was last loaded. */
const pageState = (page: Page) =>
  page.evaluate(() => ({
    same: (window as { edwMark?: true }).edwMark === true,
    loaded: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).type,
  }));

test('with the back-forward cache on, Back from /admin after Dashboard gives a working workspace', async ({
  playwright,
  request,
  baseURL,
}) => {
  await withCacheOn(playwright, async (cached) => {
    const { context, page } = await adminAtWorkspace(cached, request, baseURL);
    await editor(page).click();
    await page.keyboard.type('Round trip.', { delay: 20 });
    await markPage(page);
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Workspaces' })).toBeVisible();

    // A restore from the cache fires no load event, so wait only for the commit.
    await page.goBack({ waitUntil: 'commit' });
    await expect(page).toHaveURL(/\/w$/);
    // Restored from the cache, then reloaded by AccountApp: a fresh page, loaded by "reload".
    // Without a cache it would read "back_forward"; without the reload, the same page.
    await expect.poll(() => pageState(page)).toEqual({ same: false, loaded: 'reload' });
    await expect(editor(page)).toContainText('Round trip.');
    await expect(page.getByRole('status').filter({ hasText: 'Saving your work' })).toHaveCount(0);
    await expect(page.locator('[inert]')).toHaveCount(0);
    await editor(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' Again.', { delay: 20 });
    await expect(editor(page)).toContainText('Round trip. Again.');
    await context.close();
  });
});

test('with the back-forward cache on, Back to /w left another way keeps the typing not yet sent', async ({
  playwright,
  request,
  baseURL,
}) => {
  await withCacheOn(playwright, async (cached) => {
    const { context, page } = await adminAtWorkspace(cached, request, baseURL);
    // Typed, then away at once by address: the editor's batch may not have gone yet. Restored
    // as it was, the page sends it; a reload here would throw it away. (Without the cache the
    // batch is lost on the way out, as it always has been: nothing sends it on pagehide.)
    await editor(page).click();
    await page.keyboard.type('Kept on back.', { delay: 20 });
    await markPage(page);
    await page.goto('/api/health');
    await page.goBack({ waitUntil: 'commit' });
    await expect(page).toHaveURL(/\/w$/);
    // The same page, restored and not reloaded: what this PR guarantees.
    await page.waitForTimeout(1000);
    expect(await pageState(page)).toEqual({ same: true, loaded: 'navigate' });
    await expect.poll(() => savedText(page, request), { timeout: 8000 }).toContain('Kept on back.');
    await context.close();
  });
});

test('a teacher sees no Dashboard', async ({ browser, request }) => {
  const context = await browser.newContext();
  await becomeSomeone(context, 'teacher');
  const page = await context.newPage();
  await signUp(page, await newInvite(request, `E2E no dashboard ${Date.now().toString(36)}`));
  await expect(page.getByRole('button', { name: /^Account:/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dashboard' })).toHaveCount(0);
  await context.close();
});
