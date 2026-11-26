import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { AppDeps } from '../deps.js';
import { ADMIN_PASSWORD, newWorkspace, tempDb, testDeps, testEnv, type TempDb } from '../test-helpers.js';
import { ADMIN_SIGN_IN_HOURS, createAdminStore, type AdminStore } from './admins.js';
import { cookieNames } from './cookies.js';
import { startFakeIssuer, type FakeIssuer } from './fake-issuer.js';
import { createAccountStore, hashCode, type Account, type AccountStore } from './store.js';

const BASE = 'https://edw.example';
const { signIn: SIGN_IN, state: STATE } = cookieNames(BASE);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const password = { authorization: `Bearer ${ADMIN_PASSWORD}` };

let t: TempDb;
let deps: AppDeps;
let app: FastifyInstance;
let accounts: AccountStore;
let admins: AdminStore;
let fake: FakeIssuer;
let n = 0;

beforeAll(async () => {
  fake = await startFakeIssuer();
  t = await tempDb();
  const base = testDeps(t.db);
  accounts = createAccountStore(t.db, base.sessions);
  admins = createAdminStore(t.db);
  const providers = [{ kind: 'oidc' as const, id: 'test', label: 'Test', family: 'generic' as const, issuer: fake.url, clientId: fake.clientId, clientSecret: fake.clientSecret, allowHttp: true }];
  deps = { ...base, env: testEnv({ AUTH_SECRET: 's'.repeat(40), AUTH_BASE_URL: BASE }), accounts, signIn: { providers } };
  app = await buildApp(deps);
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await fake.close();
  t.cleanup();
});

async function newAccount(admin: boolean): Promise<Account> {
  const { code } = await accounts.createInvite({ label: `Workspace ${++n}` });
  const { account } = await accounts.claimInvite(code, { provider: 'test', subject: `acc-${n}`, email: `t${n}@school.example`, displayName: `Teacher ${n}` });
  if (admin) await admins.setAdmin(account.id, true);
  return account;
}
async function cookieFor(admin: boolean): Promise<{ account: Account; cookie: string; id: string }> {
  const account = await newAccount(admin);
  const { id } = await accounts.startSignIn(account);
  return { account, id, cookie: `${SIGN_IN}=${id}` };
}

describe('requireAdmin with the sign-in cookie', () => {
  it('lets a fresh admin sign-in in, and says who it is', async () => {
    const { account, cookie } = await cookieFor(true);
    const me = await app.inject({ url: '/api/admin/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.headers['cache-control']).toBe('no-store');
    expect(me.json()).toEqual({ via: 'account', account: { id: account.id, name: account.display_name, email: account.email, provider: 'test' } });
    expect((await app.inject({ url: '/api/admin/sessions', headers: { cookie } })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/admin/invites', headers: { cookie } })).headers['cache-control']).toBe('no-store');
  });

  it('refuses a non-admin, an old sign-in and an ended one', async () => {
    const plain = await cookieFor(false);
    expect((await app.inject({ url: '/api/admin/sessions', headers: { cookie: plain.cookie } })).statusCode).toBe(401);

    const old = await cookieFor(true);
    await t.db.execute('UPDATE sign_ins SET created_at = ? WHERE id_hash = ?', [new Date(Date.now() - (ADMIN_SIGN_IN_HOURS + 1) * 3_600_000).toISOString(), hashCode(old.id)]);
    expect((await app.inject({ url: '/api/admin/sessions', headers: { cookie: old.cookie } })).statusCode).toBe(401);

    const ended = await cookieFor(true);
    const out = await app.inject({ method: 'POST', url: '/api/auth/sign-out', headers: { cookie: ended.cookie, origin: BASE } });
    expect(out.statusCode).toBe(204);
    expect((await app.inject({ url: '/api/admin/sessions', headers: { cookie: ended.cookie } })).statusCode).toBe(401);
  });

  it('refuses a write from another site or with no Origin, and allows it from this one', async () => {
    const { cookie } = await cookieFor(true);
    const payload = { label: 'Cross-site' };
    for (const headers of [{ cookie, origin: 'https://evil.example' }, { cookie }, { cookie, origin: 'null' }]) {
      const res = await app.inject({ method: 'POST', url: '/api/admin/invites', headers, payload });
      expect(res.statusCode, JSON.stringify(headers)).toBe(403);
    }
    expect((await app.inject({ method: 'POST', url: '/api/admin/invites', headers: { cookie, origin: BASE }, payload })).statusCode).toBe(201);
  });

  it('serves an asset to an <img> with only the cookie', async () => {
    const { cookie } = await cookieFor(true);
    const { session, thread, doc } = await newWorkspace(deps);
    const envelope = { client_ts: new Date().toISOString(), focus_pane: 'canvas', doc_id: doc.id, thread_id: thread.id };
    const up = await app.inject({
      method: 'POST',
      url: `/api/sessions/${session.session_id}/assets`,
      headers: { authorization: `Bearer ${session.participant_token}` },
      payload: { filename: 'dot.png', mime: 'image/png', data_base64: PNG.toString('base64'), envelope },
    });
    const url = `/api/admin/sessions/${session.session_id}/assets/${up.json().asset_id}`;
    expect((await app.inject({ url, headers: { cookie } })).statusCode).toBe(200);
    expect((await app.inject({ url })).statusCode).toBe(401);
  });
});

describe('the admin password', () => {
  it('works off Vercel', async () => {
    const me = await app.inject({ url: '/api/admin/me', headers: password });
    expect(me.json()).toEqual({ via: 'password' });
  });

  it('says in a 401 whether the password is taken, so /admin knows to offer it', async () => {
    const off = await app.inject({ url: '/api/admin/me' });
    expect(off.statusCode).toBe(401);
    expect(off.json()).toMatchObject({ password: true });
    const t2 = await tempDb();
    const onVercel = await buildApp({ ...testDeps(t2.db), env: testEnv({ VERCEL_ENV: 'production', AUTH_SECRET: 's'.repeat(40), AUTH_BASE_URL: BASE }) });
    const on = await onVercel.inject({ url: '/api/admin/me', headers: password });
    expect(on.statusCode).toBe(401);
    expect(on.json()).toMatchObject({ password: false });
    await onVercel.close();
    t2.cleanup();
  });

  it('is refused in production, in the header or the query, while a sign-in still works', async () => {
    const t2 = await tempDb();
    const base = testDeps(t2.db);
    const onVercel = await buildApp({ ...base, env: testEnv({ VERCEL_ENV: 'production', AUTH_SECRET: 's'.repeat(40), AUTH_BASE_URL: BASE }) });
    expect((await onVercel.inject({ url: '/api/admin/sessions', headers: password })).statusCode).toBe(401);
    expect((await onVercel.inject({ url: `/api/admin/sessions/x/assets/y?token=${ADMIN_PASSWORD}` })).statusCode).toBe(401);
    const store = createAccountStore(t2.db, base.sessions);
    const { code } = await store.createInvite({ label: 'W' });
    const { account } = await store.claimInvite(code, { provider: 'test', subject: 'v', email: null, displayName: null });
    await createAdminStore(t2.db).setAdmin(account.id, true);
    const { id } = await store.startSignIn(account);
    expect((await onVercel.inject({ url: '/api/admin/sessions', headers: { cookie: `${SIGN_IN}=${id}` } })).statusCode).toBe(200);
    await onVercel.close();
    t2.cleanup();
  });
});

describe('/api/admin/accounts', () => {
  it('lists accounts and sets the flag, never removing the last admin', async () => {
    await t.db.execute('UPDATE accounts SET is_admin = 0');
    const me = await cookieFor(true);
    const other = await newAccount(false);
    const headers = { cookie: me.cookie, origin: BASE };

    const list = (await app.inject({ url: '/api/admin/accounts', headers })).json().accounts as { id: string; admin: boolean; workspace: { label: string } }[];
    expect(list.find((a) => a.id === me.account.id)).toMatchObject({ admin: true, email: me.account.email, name: me.account.display_name, provider: 'test' });
    expect(list.find((a) => a.id === other.id)).toMatchObject({ admin: false, workspace: { label: expect.stringMatching(/^Workspace/) } });

    const put = (id: string, payload: unknown, h: Record<string, string> = headers) => app.inject({ method: 'PUT', url: `/api/admin/accounts/${id}/admin`, headers: h, payload: payload as object });
    const last = await put(me.account.id, { admin: false });
    expect(last.statusCode).toBe(409);
    expect(last.json().code).toBe('last_admin');
    expect((await put('nobody', { admin: true })).statusCode).toBe(404);
    expect((await put(other.id, { admin: 'yes' })).statusCode).toBe(400);
    expect((await put(other.id, { admin: true }, { cookie: me.cookie, origin: 'https://evil.example' })).statusCode).toBe(403);
    expect(await admins.isAdmin(other.id)).toBe(false);

    expect((await put(other.id, { admin: true })).statusCode).toBe(204);
    expect((await put(me.account.id, { admin: false })).statusCode).toBe(204);
    // No longer an admin: the same cookie is refused at once.
    expect((await app.inject({ url: '/api/admin/accounts', headers })).statusCode).toBe(401);
  });
});

describe('logging the flag', () => {
  it('logs one line with the two account ids, and no email or name', async () => {
    const lines: string[] = [];
    const logged = await buildApp(deps, { logger: true, logStream: { write: (line) => void lines.push(line) } });
    const me = await cookieFor(true);
    const other = await newAccount(false);
    const res = await logged.inject({ method: 'PUT', url: `/api/admin/accounts/${other.id}/admin`, headers: { cookie: me.cookie, origin: BASE }, payload: { admin: true } });
    expect(res.statusCode).toBe(204);
    await logged.close();
    const granted = lines.map((l) => JSON.parse(l) as Record<string, unknown>).filter((l) => l.msg === 'admin granted');
    expect(granted).toEqual([expect.objectContaining({ by: me.account.id, account_id: other.id, admin: true })]);
    const all = lines.join('\n');
    for (const secret of [me.account.email, other.email, me.account.display_name, other.display_name]) expect(all).not.toContain(secret!);
  });
});

describe('deleting a workspace', () => {
  it("never deletes the only admin's workspace, which would take the account with it", async () => {
    await t.db.execute('UPDATE accounts SET is_admin = 0');
    const me = await cookieFor(true);
    const headers = { cookie: me.cookie, origin: BASE };
    const del = (id: string) => app.inject({ method: 'DELETE', url: `/api/admin/sessions/${id}`, headers });
    const refused = await del(me.account.session_id);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().code).toBe('last_admin');
    expect(await admins.isAdmin(me.account.id)).toBe(true);
    expect(await deps.sessions.get(me.account.session_id)).not.toBeNull();
    // With a second admin it goes, and that sign-in with it.
    const other = await newAccount(true);
    expect((await del(me.account.session_id)).statusCode).toBe(204);
    expect((await app.inject({ url: '/api/admin/me', headers })).statusCode).toBe(401);
    expect(await admins.isAdmin(other.id)).toBe(true);
  });
});

describe('signing in as an admin', () => {
  it('lands everyone on /w, and an admin on /admin only for a sign-in started from /admin', async () => {
    const land = async (sub: string, query = '') => {
      const start = await app.inject({ url: `/api/auth/test/start${query}` });
      const state = [start.headers['set-cookie']].flat().map(String).find((c) => c.startsWith(`${STATE}=`))!.split(';')[0]!;
      fake.next({ claims: { sub } });
      const back = new URL((await fetch(start.headers.location!, { redirect: 'manual' })).headers.get('location')!);
      const done = await app.inject({ url: back.pathname + back.search, headers: { cookie: state } });
      const signIn = [done.headers['set-cookie']].flat().map(String).find((c) => c.startsWith(`${SIGN_IN}=`))!.split(';')[0]!;
      const ws = (await app.inject({ url: '/api/account/workspace', headers: { cookie: signIn } })).json();
      return { location: done.headers.location, isAdmin: ws.account.is_admin };
    };
    const { code } = await accounts.createInvite({ label: 'Lands' });
    expect(await land('lands', `?invite=${code}`)).toEqual({ location: '/w', isAdmin: false });
    // Not an admin: asking for /admin still lands on /w.
    expect(await land('lands', '?then=admin')).toEqual({ location: '/w', isAdmin: false });
    const account = (await accounts.findAccount('test', 'lands'))!;
    await admins.setAdmin(account.id, true);
    expect(await land('lands')).toEqual({ location: '/w', isAdmin: true });
    expect(await land('lands', '?then=admin')).toEqual({ location: '/admin', isAdmin: true });
    // Only the one allowed value: anything else is a plain sign-in, never a free address.
    expect(await land('lands', `?then=${encodeURIComponent('https://evil.example')}`)).toEqual({ location: '/w', isAdmin: true });
  });
});
