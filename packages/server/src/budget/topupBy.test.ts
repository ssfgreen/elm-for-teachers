/** Which admin made a top-up: `budget_update` names the account when signed in with one, and none for the password. */
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

const topUp = (headers: Record<string, string>) => app.inject({ method: 'POST', url: `/api/admin/sessions/${sid}/budget/topup`, headers });
const updates = async () => (await deps.events.list(sid)).filter((e) => e.kind === 'budget_update');

describe('budget_update names the admin who added £10', () => {
  it('logs the account id when the admin is signed in with an admin account', async () => {
    const accounts = deps.accounts!;
    const { code } = await accounts.createInvite({ label: 'Admin workspace' });
    const { account } = await accounts.claimInvite(code, { provider: 'test', subject: 'admin-1', email: null, displayName: null });
    await createAdminStore(t.db).setAdmin(account.id, true);
    const { id } = await accounts.startSignIn(account);
    const res = await topUp({ cookie: `${cookieNames(BASE).signIn}=${id}`, origin: BASE });
    expect(res.statusCode).toBe(200);
    expect((await updates()).map((e) => e.payload)).toEqual([expect.objectContaining({ amount_gbp: 10, via: 'account', account_id: account.id })]);
  });

  it('logs no account for the admin password', async () => {
    expect((await topUp({ authorization: `Bearer ${ADMIN_PASSWORD}` })).statusCode).toBe(200);
    const logged = await updates();
    expect(logged.map((e) => e.payload)).toEqual([expect.objectContaining({ via: 'password' })]);
    expect(logged[0]!.payload).not.toHaveProperty('account_id');
  });
});
