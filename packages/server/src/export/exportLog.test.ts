import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { AppDeps } from '../deps.js';
import { ADMIN_PASSWORD, newWorkspace, tempDb, testDeps, testEnv, type TempDb } from '../test-helpers.js';
import { createAdminStore } from '../accounts/admins.js';
import { cookieNames } from '../accounts/cookies.js';
import { createAccountStore } from '../accounts/store.js';

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
let sid: string;
const auth = { authorization: `Bearer ${ADMIN_PASSWORD}` };
const BASE = 'https://edw.example';

beforeEach(async () => {
  t = await tempDb();
  const base = testDeps(t.db);
  deps = { ...base, env: testEnv({ AUTH_SECRET: 's'.repeat(40), AUTH_BASE_URL: BASE }), accounts: createAccountStore(t.db, base.sessions) };
  app = await buildApp(deps);
  await app.ready();
  sid = (await newWorkspace(deps)).session.session_id;
});
afterEach(async () => {
  await app.close();
  t.cleanup();
});

const exports = async () => (await deps.events.list(sid)).filter((e) => e.kind === 'workspace_export');

describe('admin export logs workspace_export', () => {
  it('writes one event per download, server side, naming the format and the file count', async () => {
    const zip = await app.inject({ url: `/api/admin/sessions/${sid}/export`, headers: auth });
    expect(zip.statusCode).toBe(200);
    const logged = await exports();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ kind: 'workspace_export', focus_pane: 'none', payload: { format: 'zip', via: 'password', files: expect.any(Number) } });
    // A password export names no account.
    expect(logged[0]!.payload).not.toHaveProperty('account_id');
    expect((logged[0]!.payload as { files: number }).files).toBeGreaterThan(10);

    const json = await app.inject({ url: `/api/admin/sessions/${sid}/export.json`, headers: auth });
    expect(json.statusCode).toBe(200);
    // Each bundle is built before its own event is logged: the second holds the first download's.
    expect(json.json()['events.jsonl']).toContain('"workspace_export"');
    expect((await exports()).map((e) => (e.payload as { format: string }).format)).toEqual(['zip', 'json']);
  });

  it("says 'account', and which account, when the admin is signed in with an admin account", async () => {
    const accounts = deps.accounts!;
    const { code } = await accounts.createInvite({ label: 'Admin workspace' });
    const { account } = await accounts.claimInvite(code, { provider: 'test', subject: 'admin-1', email: null, displayName: null });
    await createAdminStore(t.db).setAdmin(account.id, true);
    const { id } = await accounts.startSignIn(account);
    const res = await app.inject({ url: `/api/admin/sessions/${sid}/export`, headers: { cookie: `${cookieNames(BASE).signIn}=${id}`, 'sec-fetch-site': 'same-origin' } });
    expect(res.statusCode).toBe(200);
    expect((await exports()).map((e) => e.payload)).toEqual([expect.objectContaining({ format: 'zip', via: 'account', account_id: account.id })]);
  });

  it('logs nothing when the export is refused', async () => {
    expect((await app.inject({ url: `/api/admin/sessions/${sid}/export` })).statusCode).toBe(401);
    expect(await exports()).toHaveLength(0);
  });
});
