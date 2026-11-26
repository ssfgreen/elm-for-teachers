import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { AppDeps } from '../deps.js';
import { ADMIN_PASSWORD, newWorkspace, tempDb, testDeps, testEnv, type TempDb } from '../test-helpers.js';
import { createAdminStore } from '../accounts/admins.js';
import { cookieNames } from '../accounts/cookies.js';
import { createAccountStore } from '../accounts/store.js';

/**
 * The export GETs write a workspace_export event, and the admin cookie is SameSite=Lax, which a
 * top-level link from another site still carries. So the cookie opens them only for a fetch from
 * this site's own pages (Sec-Fetch-Site: same-origin, or Origin equal to the site's).
 */
let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
let sid: string;
let cookie: string;
const BASE = 'https://edw.example';

beforeEach(async () => {
  t = await tempDb();
  const base = testDeps(t.db);
  deps = { ...base, env: testEnv({ AUTH_SECRET: 's'.repeat(40), AUTH_BASE_URL: BASE }), accounts: createAccountStore(t.db, base.sessions) };
  app = await buildApp(deps);
  await app.ready();
  sid = (await newWorkspace(deps)).session.session_id;
  const accounts = deps.accounts!;
  const { account } = await accounts.claimInvite((await accounts.createInvite({ label: 'Admin' })).code, { provider: 'test', subject: 'admin-x', email: null, displayName: null });
  await createAdminStore(t.db).setAdmin(account.id, true);
  cookie = `${cookieNames(BASE).signIn}=${(await accounts.startSignIn(account)).id}`;
});
afterEach(async () => {
  await app.close();
  t.cleanup();
});

const exports = async () => (await deps.events.list(sid)).filter((e) => e.kind === 'workspace_export');

describe.each(['export', 'export.json'])('GET /api/admin/sessions/:id/%s with the admin cookie', (path) => {
  const get = (headers: Record<string, string>) => app.inject({ url: `/api/admin/sessions/${sid}/${path}`, headers: { cookie, ...headers } });

  it('refuses a link from another site, a typed address and a request with no fetch metadata, and logs nothing', async () => {
    const refused: Record<string, string>[] = [{ 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' }, { 'sec-fetch-site': 'same-site' }, { 'sec-fetch-site': 'none' }, {}, { origin: 'https://evil.example' }];
    for (const headers of refused) {
      const res = await get(headers);
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('export_from_site');
    }
    expect(await exports()).toEqual([]);
  });

  it('serves a fetch from this site’s own page', async () => {
    expect((await get({ 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' })).statusCode).toBe(200);
    expect((await get({ origin: BASE })).statusCode).toBe(200);
    expect(await exports()).toHaveLength(2);
  });

  it('still serves the admin password, which no other site can send', async () => {
    const res = await app.inject({ url: `/api/admin/sessions/${sid}/${path}`, headers: { authorization: `Bearer ${ADMIN_PASSWORD}`, 'sec-fetch-site': 'cross-site' } });
    expect(res.statusCode).toBe(200);
  });
});
