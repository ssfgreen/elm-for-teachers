/** Which admin set a workspace's switches: `workspace_features_set` names the account when signed in with one, and none for the password. */
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

const logged = async (id: string) => (await deps.events.list(id)).filter((e) => e.kind === 'workspace_features_set').map((e) => e.payload);

/** A signed-in admin account's cookie headers, and its id. */
async function adminAccount(): Promise<{ id: string; headers: Record<string, string> }> {
  const accounts = deps.accounts!;
  const { code } = await accounts.createInvite({ label: 'Admin workspace' });
  const { account } = await accounts.claimInvite(code, { provider: 'test', subject: 'admin-1', email: null, displayName: null });
  await createAdminStore(t.db).setAdmin(account.id, true);
  const { id } = await accounts.startSignIn(account);
  return { id: account.id, headers: { cookie: `${cookieNames(BASE).signIn}=${id}`, origin: BASE } };
}

describe('workspace_features_set names the admin who set the switches', () => {
  it('logs the account id when the admin is signed in with an admin account, on a PUT and at creation', async () => {
    const admin = await adminAccount();
    const res = await app.inject({ method: 'PUT', url: `/api/admin/sessions/${sid}/features`, headers: admin.headers, payload: { features: { plugins: false } } });
    expect(res.statusCode).toBe(200);
    expect(await logged(sid)).toEqual([expect.objectContaining({ changed: ['plugins'], via: 'account', account_id: admin.id })]);

    const made = await app.inject({ method: 'POST', url: '/api/admin/sessions', headers: admin.headers, payload: { label: 'Y8', features: { classes: false } } });
    expect(made.statusCode).toBe(201);
    expect(await logged(made.json().session.session_id)).toEqual([expect.objectContaining({ changed: ['classes'], via: 'account', account_id: admin.id })]);
  });

  it('logs no account for the admin password', async () => {
    const res = await app.inject({ method: 'PUT', url: `/api/admin/sessions/${sid}/features`, headers: { authorization: `Bearer ${ADMIN_PASSWORD}` }, payload: { features: { plugins: false } } });
    expect(res.statusCode).toBe(200);
    const payloads = await logged(sid);
    expect(payloads).toEqual([expect.objectContaining({ via: 'password' })]);
    expect(payloads[0]).not.toHaveProperty('account_id');
  });
});
